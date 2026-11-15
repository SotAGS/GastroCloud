import { Transaction } from 'sequelize';
import { sequelize } from '../config/database.config';
import { AuthUser } from '../interfaces/auth-user.interface';
import { CreateSaleDto } from '../interfaces/dto.interface';
import { InventoryMovementType, InventoryOriginType } from '../enums/inventory-movement.enum';
import { SaleStatus } from '../enums/sale-status.enum';
import { Stock } from '../models';
import { InventoryMovementRepository } from '../repositories/inventory-movement.repository';
import { ProductRepository } from '../repositories/product.repository';
import { SaleRepository } from '../repositories/sale.repository';
import { StockRepository } from '../repositories/stock.repository';
import { HttpError } from '../utils/http-error.util';
import { ensureSufficientSaleStock } from '../utils/sale-quantity.util';
import { generateSaleNumber } from '../utils/string.util';
import { getTenantScope } from '../utils/tenant-scope.util';
import { priceSaleDetails } from '../utils/sale-price.util';

export class SaleService {
  private readonly productRepository = new ProductRepository();
  private readonly saleRepository = new SaleRepository();
  private readonly stockRepository = new StockRepository();
  private readonly inventoryMovementRepository = new InventoryMovementRepository();

  async listSales(user: AuthUser) {
    return this.saleRepository.listAll(getTenantScope(user));
  }

  async listAvailableProducts(user: AuthUser) {
    const scope = getTenantScope(user);
    if (!user.localId) {
      throw new HttpError(403, 'La cuenta no tiene una sucursal asignada para registrar ventas.');
    }

    return this.productRepository.listAvailableForSale(scope.companyId, user.localId);
  }

  async getById(id: string, user: AuthUser) {
    const scope = getTenantScope(user);
    return sequelize.transaction(async (transaction) => {
      const sale = await this.saleRepository.findById(id, scope, transaction);
      if (!sale) {
        throw new HttpError(404, 'Venta no encontrada.');
      }
      return sale;
    });
  }

  async createSale(payload: CreateSaleDto, user: AuthUser) {
    const scope = getTenantScope(user);
    const localId = user.localId;
    if (!localId) {
      throw new HttpError(403, 'La cuenta no tiene una sucursal asignada para registrar ventas.');
    }

    if (!Array.isArray(payload.details) || payload.details.length === 0) {
      throw new HttpError(400, 'La venta debe incluir al menos un producto.');
    }

    const productIds = payload.details.map((detail) => detail.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new HttpError(400, 'Cada producto debe aparecer una sola vez en la venta.');
    }

    for (const detail of payload.details) {
      if (!Number.isFinite(detail.quantity) || detail.quantity <= 0) {
        throw new HttpError(400, 'La cantidad debe ser válida.');
      }
    }

    return sequelize.transaction(async (transaction) => {
      const activeProducts = await this.productRepository.findActiveByIds(productIds, scope.companyId, localId, transaction);
      if (activeProducts.length !== productIds.length) {
        throw new HttpError(404, 'Uno o más productos no están disponibles en esta empresa y sucursal.');
      }

      const stocks = new Map<string, { stock: Stock; quantity: number }>();
      const detailsByProduct = new Map(payload.details.map((detail) => [detail.productId, detail]));

      for (const productId of [...productIds].sort()) {
        const detail = detailsByProduct.get(productId);
        if (!detail) {
          throw new HttpError(400, 'La venta contiene un producto invalido.');
        }
        const stock = await this.stockRepository.findByProductId(productId, localId, transaction);
        if (!stock) {
          throw new HttpError(409, 'El producto no tiene stock disponible en esta sucursal.');
        }
        const availableQuantity = Number(stock.currentQuantity);
        ensureSufficientSaleStock(availableQuantity, detail.quantity);
        stocks.set(productId, { stock, quantity: availableQuantity });
      }

      const details = priceSaleDetails(payload.details, activeProducts);
      const total = Number(details.reduce((sum, detail) => sum + detail.lineTotal, 0).toFixed(2));
      const sale = await this.saleRepository.create(
        {
          companyId: scope.companyId,
          localId,
          createdByUserId: user.id,
          saleNumber: generateSaleNumber(),
          total,
          details,
        },
        transaction,
      );

      for (const detail of details) {
        const stockState = stocks.get(detail.productId);
        if (!stockState) {
          throw new HttpError(500, 'No fue posible recuperar el stock reservado para la venta.');
        }
        const stockRecord = stockState.stock;
        const previousQuantity = stockState.quantity;
        const newQuantity = Number((previousQuantity - detail.quantity).toFixed(3));
        stockRecord.currentQuantity = newQuantity;
        stockRecord.lastMovementAt = new Date();
        await this.stockRepository.save(stockRecord, transaction);
        await this.inventoryMovementRepository.create(
          {
            productId: detail.productId,
            stockId: stockRecord.id,
            createdByUserId: user.id,
            movementType: InventoryMovementType.SALIDA,
            originType: InventoryOriginType.VENTA,
            originId: sale.id,
            quantity: detail.quantity,
            previousQuantity,
            newQuantity,
            notes: `Venta ${sale.saleNumber}`,
          },
          transaction,
        );
      }

      const createdSale = await this.saleRepository.findById(sale.id, scope, transaction);
      if (!createdSale) {
        throw new HttpError(500, 'No fue posible recuperar la venta creada.');
      }
      return createdSale;
    });
  }

  async cancelSale(id: string, user: AuthUser) {
    const scope = getTenantScope(user);
    return sequelize.transaction(async (transaction: Transaction) => {
      const sale = await this.saleRepository.findById(id, scope, transaction, true);
      if (!sale) {
        throw new HttpError(404, 'Venta no encontrada.');
      }
      if (sale.status !== SaleStatus.COMPLETED) {
        throw new HttpError(409, 'La venta ya fue anulada.');
      }

      for (const detail of [...sale.details].sort((a, b) => a.productId.localeCompare(b.productId))) {
        const stock = await this.stockRepository.findByProductId(detail.productId, sale.localId, transaction);
        if (!stock) {
          throw new HttpError(409, 'No se puede anular la venta porque falta el registro de stock asociado.');
        }

        const previousQuantity = Number(stock.currentQuantity);
        const newQuantity = Number((previousQuantity + Number(detail.quantity)).toFixed(3));
        stock.currentQuantity = newQuantity;
        stock.lastMovementAt = new Date();
        await this.stockRepository.save(stock, transaction);
        await this.inventoryMovementRepository.create(
          {
            productId: detail.productId,
            stockId: stock.id,
            createdByUserId: user.id,
            movementType: InventoryMovementType.ENTRADA,
            originType: InventoryOriginType.VENTA,
            originId: sale.id,
            quantity: Number(detail.quantity),
            previousQuantity,
            newQuantity,
            notes: `Reversión de venta anulada ${sale.saleNumber}`,
          },
          transaction,
        );
      }

      sale.status = SaleStatus.CANCELLED;
      sale.cancelledAt = new Date();
      await sale.save({ transaction });
      return sale;
    });
  }
}

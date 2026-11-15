import { Transaction } from 'sequelize';
import { sequelize } from '../config/database.config';
import { PurchaseStatus } from '../enums/purchase-status.enum';
import { CreatePurchaseDto } from '../interfaces/dto.interface';
import { ProductRepository } from '../repositories/product.repository';
import { PurchaseRepository } from '../repositories/purchase.repository';
import { SupplierRepository } from '../repositories/supplier.repository';
import { HttpError } from '../utils/http-error.util';
import { generatePurchaseNumber } from '../utils/string.util';
import { StockService } from './stock.service';
import { AuthUser } from '../interfaces/auth-user.interface';
import { getTenantScope } from '../utils/tenant-scope.util';

export class PurchaseService {
  private readonly supplierRepository = new SupplierRepository();
  private readonly productRepository = new ProductRepository();
  private readonly purchaseRepository = new PurchaseRepository();
  private readonly stockService = new StockService();

  async listPurchases(user: AuthUser) {
    return this.purchaseRepository.listAll(getTenantScope(user));
  }

  async getById(id: string, user: AuthUser) {
    const purchase = await this.purchaseRepository.findByIdWithDetails(id, getTenantScope(user));
    if (!purchase) {
      throw new HttpError(404, 'Compra no encontrada');
    }
    return purchase;
  }

  async createPurchase(payload: CreatePurchaseDto, user: AuthUser) {
    const scope = getTenantScope(user);
    const localId = user.localId;
    if (!localId) {
      throw new HttpError(403, 'La cuenta no tiene una sucursal asignada para registrar compras.');
    }

    await this.validateCreatePayload(payload, scope.companyId, localId);

    const subtotal = payload.details.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

    return sequelize.transaction(async (transaction) => {
      const purchase = await this.purchaseRepository.createWithDetails(
        payload,
        user.id,
        scope.companyId,
        localId,
        generatePurchaseNumber(),
        Number(subtotal.toFixed(2)),
        transaction,
      );

      const completePurchase = await this.purchaseRepository.findByIdWithDetails(purchase.id, scope, transaction);
      if (!completePurchase) {
        throw new HttpError(500, 'No fue posible recuperar la compra creada');
      }
      return completePurchase;
    });
  }

  async changeStatus(purchaseId: string, status: PurchaseStatus, user: AuthUser) {
    const scope = getTenantScope(user);
    return sequelize.transaction(async (transaction: Transaction) => {
      const purchase = await this.purchaseRepository.findByIdWithDetails(purchaseId, scope, transaction);
      if (!purchase) {
        throw new HttpError(404, 'Compra no encontrada');
      }

      this.validateStatusTransition(purchase.status, status);

      if (status === PurchaseStatus.RECIBIDA) {
        if (!purchase.details || purchase.details.length === 0) {
          throw new HttpError(409, 'No se puede recibir una compra sin detalles');
        }
        if (purchase.details.some(
          (detail) => detail.product?.companyId !== scope.companyId || detail.product?.localId !== purchase.localId,
        )) {
          throw new HttpError(409, 'La compra contiene productos sin una asignación válida a su sucursal.');
        }

        if (!purchase.localId) {
          throw new HttpError(409, 'La compra no tiene una sucursal asociada.');
        }
        await this.stockService.increaseFromPurchase(purchase.id, purchase.details, user.id, purchase.localId, transaction);
      }

      await this.purchaseRepository.updateStatus(purchase.id, status, transaction);
      const updated = await this.purchaseRepository.findByIdWithDetails(purchase.id, scope, transaction);

      if (!updated) {
        throw new HttpError(500, 'No fue posible recuperar la compra actualizada');
      }

      return updated;
    });
  }

  private validateStatusTransition(current: PurchaseStatus, next: PurchaseStatus): void {
    if (current === next) {
      throw new HttpError(409, 'La compra ya se encuentra en ese estado');
    }

    const allowedTransitions: Record<PurchaseStatus, PurchaseStatus[]> = {
      [PurchaseStatus.PENDIENTE]: [PurchaseStatus.RECIBIDA, PurchaseStatus.CANCELADA],
      [PurchaseStatus.RECIBIDA]: [],
      [PurchaseStatus.CANCELADA]: [],
    };

    if (!allowedTransitions[current].includes(next)) {
      throw new HttpError(409, 'Transicion de estado invalida');
    }
  }

  private async validateCreatePayload(payload: CreatePurchaseDto, companyId: string, localId: string): Promise<void> {
    const supplier = await this.supplierRepository.findActiveById(payload.supplierId, companyId);
    if (!supplier) {
      throw new HttpError(404, 'Proveedor inexistente o inactivo');
    }

    if (!payload.details || payload.details.length === 0) {
      throw new HttpError(400, 'La compra debe incluir al menos un detalle');
    }

    const hasInvalidDetail = payload.details.some((item) => item.quantity <= 0 || item.unitCost < 0);
    if (hasInvalidDetail) {
      throw new HttpError(400, 'Hay lineas de detalle con valores invalidos');
    }

    const productIds = [...new Set(payload.details.map((item) => item.productId))];
    const count = await this.productRepository.countActiveByIds(productIds, companyId, undefined, localId);
    if (count !== productIds.length) {
      throw new HttpError(404, 'Uno o mas productos no existen o estan inactivos');
    }
  }
}
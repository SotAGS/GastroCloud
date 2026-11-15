import { Op, Transaction } from 'sequelize';
import { sequelize } from '../config/database.config';
import { InventoryMovementType, InventoryOriginType } from '../enums/inventory-movement.enum';
import { AuthUser } from '../interfaces/auth-user.interface';
import { Category, InventoryMovement, Local, Product, PurchaseDetail, SaleDetail, Stock, Supplier } from '../models';
import { HttpError } from '../utils/http-error.util';
import { normalizeText } from '../utils/string.util';
import { getTenantScope } from '../utils/tenant-scope.util';

interface ProductInput {
  localId: string;
  categoryId: string;
  name: string;
  sku?: string;
  description?: string;
  unit: string;
  salePrice: number;
  initialQuantity: number;
  currentQuantity?: number;
}

interface CategoryInput {
  localId: string;
  name: string;
  description?: string;
}

interface SupplierInput {
  businessName: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export class CatalogService {
  async listProducts(user: AuthUser) {
    const scope = getTenantScope(user);
    return Product.findAll({
      where: {
        companyId: scope.companyId,
        localId: scope.localId ?? { [Op.not]: null },
      },
      paranoid: false,
      include: [
        { model: Category },
        { association: 'stocks' },
        { model: Local, attributes: ['id', 'name'] },
      ],
      order: [[{ model: Local, as: 'local' }, 'name', 'ASC'], ['name', 'ASC']],
    });
  }

  async listCategories(user: AuthUser) {
    const scope = getTenantScope(user);
    return Category.findAll({
      where: {
        companyId: scope.companyId,
        localId: scope.localId ?? { [Op.not]: null },
      },
      include: [{ model: Local, attributes: ['id', 'name'] }],
      order: [['name', 'ASC']],
    });
  }

  async listSuppliers(user: AuthUser) {
    const scope = getTenantScope(user);
    return Supplier.findAll({
      where: { companyId: scope.companyId },
      order: [['businessName', 'ASC']],
    });
  }

  async listBranches(user: AuthUser) {
    const scope = getTenantScope(user);
    return Local.findAll({
      where: {
        companyId: scope.companyId,
        isActive: true,
        ...(scope.localId ? { id: scope.localId } : {}),
      },
      order: [['name', 'ASC']],
    });
  }

  async getPurchaseFormData(user: AuthUser) {
    const scope = getTenantScope(user);
    if (!user.localId) throw new HttpError(403, 'La cuenta no tiene una sucursal asignada para registrar compras.');
    const [suppliers, products] = await Promise.all([
      Supplier.findAll({ where: { companyId: scope.companyId, isActive: true }, order: [['businessName', 'ASC']] }),
      Product.findAll({
        where: { companyId: scope.companyId, localId: user.localId, isActive: true },
        order: [['name', 'ASC']],
      }),
    ]);
    return { suppliers, products };
  }

  async createCategory(user: AuthUser, payload: CategoryInput) {
    const scope = getTenantScope(user);
    const local = await this.findLocal(payload.localId, scope.companyId, scope.localId);
    const name = payload.name.trim();
    const nameNormalized = normalizeText(name);
    await this.ensureCategoryNameAvailable(nameNormalized, local.id);
    return Category.create({
      companyId: scope.companyId,
      localId: local.id,
      name,
      nameNormalized,
      description: payload.description?.trim() || null,
      isActive: true,
    });
  }

  async updateCategory(user: AuthUser, categoryId: string, payload: CategoryInput) {
    const scope = getTenantScope(user);
    const category = await Category.findOne({
      where: {
        id: categoryId,
        companyId: scope.companyId,
        ...(scope.localId ? { localId: scope.localId } : {}),
      },
    });
    if (!category) throw new HttpError(404, 'Categoría no encontrada.');
    const local = await this.findLocal(payload.localId, scope.companyId, scope.localId);
    if (local.id !== category.localId) {
      const productCount = await Product.count({ where: { categoryId: category.id } });
      if (productCount > 0) throw new HttpError(409, 'No se puede mover una categoría que ya tiene productos asociados.');
    }
    const name = payload.name.trim();
    const nameNormalized = normalizeText(name);
    await this.ensureCategoryNameAvailable(nameNormalized, local.id, category.id);
    category.localId = local.id;
    category.name = name;
    category.nameNormalized = nameNormalized;
    category.description = payload.description?.trim() || null;
    await category.save();
    return category;
  }

  async setCategoryActive(user: AuthUser, categoryId: string, isActive: boolean) {
    const scope = getTenantScope(user);
    const category = await Category.findOne({
      where: {
        id: categoryId,
        companyId: scope.companyId,
        ...(scope.localId ? { localId: scope.localId } : {}),
      },
    });
    if (!category) throw new HttpError(404, 'Categoría no encontrada.');
    if (isActive) {
      if (!category.localId) throw new HttpError(409, 'No se puede reactivar una categoría sin sucursal asignada.');
      await this.ensureCategoryNameAvailable(category.nameNormalized, category.localId, category.id);
    } else {
      const products = await Product.count({ where: { categoryId: category.id, isActive: true } });
      if (products > 0) throw new HttpError(409, 'No se puede desactivar una categoría con productos activos.');
    }
    category.isActive = isActive;
    await category.save();
  }

  async createProduct(user: AuthUser, payload: ProductInput) {
    const scope = getTenantScope(user);
    const local = await this.findLocal(payload.localId, scope.companyId, scope.localId);
    const category = await Category.findOne({
      where: { id: payload.categoryId, companyId: scope.companyId, localId: local.id, isActive: true },
    });
    if (!category) throw new HttpError(400, 'La categoría no pertenece a la sucursal elegida o está inactiva.');
    this.validateProductInput(payload);

    return sequelize.transaction(async (transaction) => {
      await this.ensureProductNameAvailable(normalizeText(payload.name), local.id, transaction);
      if (payload.sku?.trim()) await this.ensureProductSkuAvailable(payload.sku.trim(), local.id, transaction);

      const product = await Product.create(
        {
          companyId: scope.companyId,
          localId: local.id,
          categoryId: category.id,
          name: payload.name.trim(),
          nameNormalized: normalizeText(payload.name),
          sku: payload.sku?.trim() || null,
          description: payload.description?.trim() || null,
          unit: payload.unit.trim(),
          salePrice: payload.salePrice,
          isActive: true,
        },
        { transaction },
      );
      const stock = await Stock.create(
        { productId: product.id, localId: local.id, currentQuantity: 0, minimumQuantity: 0, maximumQuantity: null },
        { transaction },
      );
      if (payload.initialQuantity > 0) {
        stock.currentQuantity = payload.initialQuantity;
        stock.lastMovementAt = new Date();
        await stock.save({ transaction });
        await InventoryMovement.create(
          {
            productId: product.id,
            stockId: stock.id,
            createdByUserId: user.id,
            movementType: InventoryMovementType.AJUSTE,
            originType: InventoryOriginType.AJUSTE_MANUAL,
            originId: product.id,
            quantity: payload.initialQuantity,
            previousQuantity: 0,
            newQuantity: payload.initialQuantity,
            movementDate: new Date(),
            notes: 'Stock inicial al crear el producto',
          },
          { transaction },
        );
      }
      return product;
    });
  }

  async updateProduct(user: AuthUser, productId: string, payload: ProductInput) {
    const scope = getTenantScope(user);
    const local = await this.findLocal(payload.localId, scope.companyId, scope.localId);
    this.validateProductInput(payload);

    return sequelize.transaction(async (transaction) => {
      const product = await Product.findOne({
        where: {
          id: productId,
          companyId: scope.companyId,
          localId: local.id,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!product) throw new HttpError(404, 'Producto no encontrado en la sucursal indicada.');
      const category = await Category.findOne({
        where: { id: payload.categoryId, companyId: scope.companyId, localId: local.id, isActive: true },
        transaction,
      });
      if (!category) throw new HttpError(400, 'La categoría no pertenece a la sucursal elegida o está inactiva.');

      await this.ensureProductNameAvailable(normalizeText(payload.name), local.id, transaction, product.id);
      if (payload.sku?.trim()) {
        await this.ensureProductSkuAvailable(payload.sku.trim(), local.id, transaction, product.id);
      }

      product.categoryId = category.id;
      product.name = payload.name.trim();
      product.nameNormalized = normalizeText(payload.name);
      product.sku = payload.sku?.trim() || null;
      product.description = payload.description?.trim() || null;
      product.unit = payload.unit.trim();
      product.salePrice = payload.salePrice;
      await product.save({ transaction });

      if (payload.currentQuantity !== undefined) {
        let stock = await Stock.findOne({
          where: { productId: product.id, localId: local.id },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!stock) {
          stock = await Stock.create(
            { productId: product.id, localId: local.id, currentQuantity: 0, minimumQuantity: 0, maximumQuantity: null },
            { transaction },
          );
        }
        const previousQuantity = Number(stock.currentQuantity);
        const newQuantity = payload.currentQuantity;
        if (newQuantity !== previousQuantity) {
          stock.currentQuantity = newQuantity;
          stock.lastMovementAt = new Date();
          await stock.save({ transaction });
          await InventoryMovement.create(
            {
              productId: product.id,
              stockId: stock.id,
              createdByUserId: user.id,
              movementType: InventoryMovementType.AJUSTE,
              originType: InventoryOriginType.AJUSTE_MANUAL,
              originId: product.id,
              quantity: Number(Math.abs(newQuantity - previousQuantity).toFixed(3)),
              previousQuantity,
              newQuantity,
              movementDate: new Date(),
              notes: 'Ajuste manual de stock desde el catálogo',
            },
            { transaction },
          );
        }
      }
      return product;
    });
  }

  async deactivateProduct(user: AuthUser, productId: string) {
    const product = await this.findProductForUser(user, productId);
    product.isActive = false;
    await product.save();
  }

  async reactivateProduct(user: AuthUser, productId: string) {
    const product = await this.findProductForUser(user, productId);
    if (!product.localId) throw new HttpError(409, 'No se puede reactivar un producto sin sucursal asignada.');
    const category = await Category.findOne({
      where: { id: product.categoryId, companyId: product.companyId, localId: product.localId, isActive: true },
    });
    if (!category) throw new HttpError(409, 'Activa primero la categoría asociada al producto.');
    await this.ensureProductNameAvailable(product.nameNormalized, product.localId, undefined, product.id);
    if (product.sku) await this.ensureProductSkuAvailable(product.sku, product.localId, undefined, product.id);
    await product.restore();
    product.isActive = true;
    await product.save();
  }

  async permanentlyDeleteProduct(user: AuthUser, productId: string) {
    await sequelize.transaction(async (transaction) => {
      const scope = getTenantScope(user);
      const product = await Product.findOne({
        where: {
          id: productId,
          companyId: scope.companyId,
          ...(scope.localId ? { localId: scope.localId } : {}),
        },
        paranoid: false,
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!product) throw new HttpError(404, 'Producto no encontrado.');
      if (!product.localId) throw new HttpError(409, 'No se puede borrar un producto histórico sin sucursal asignada.');
      const [sales, purchases, movements, stocks] = await Promise.all([
        SaleDetail.count({ where: { productId }, transaction }),
        PurchaseDetail.count({ where: { productId }, transaction }),
        InventoryMovement.count({ where: { productId }, transaction }),
        Stock.findAll({
          where: { productId },
          transaction,
          lock: transaction.LOCK.UPDATE,
        }),
      ]);
      if (
        sales ||
        purchases ||
        movements ||
        stocks.some(
          (stock) => stock.localId !== product.localId || Number(stock.currentQuantity) !== 0,
        )
      ) {
        throw new HttpError(
          409,
          'No se puede borrar definitivamente: el producto tiene ventas, compras, movimientos o stock. Desactívalo para conservar el historial.',
        );
      }
      for (const stock of stocks) await stock.destroy({ transaction });
      await product.destroy({ force: true, transaction });
    });
  }

  async createSupplier(user: AuthUser, payload: SupplierInput) {
    const scope = getTenantScope(user);
    const businessName = payload.businessName.trim();
    if (!businessName) throw new HttpError(400, 'El nombre del proveedor es obligatorio.');
    const businessNameNormalized = normalizeText(businessName);
    const existing = await Supplier.findOne({ where: { companyId: scope.companyId, businessNameNormalized } });
    if (existing) throw new HttpError(409, 'Ya existe un proveedor con ese nombre en la empresa.');
    if (payload.taxId?.trim()) {
      const taxIdExists = await Supplier.findOne({ where: { companyId: scope.companyId, taxId: payload.taxId.trim() } });
      if (taxIdExists) throw new HttpError(409, 'Ya existe un proveedor con ese identificador fiscal en la empresa.');
    }
    return Supplier.create({
      companyId: scope.companyId,
      businessName,
      businessNameNormalized,
      taxId: payload.taxId?.trim() || null,
      email: payload.email?.trim().toLowerCase() || null,
      phone: payload.phone?.trim() || null,
      address: payload.address?.trim() || null,
      isActive: true,
    });
  }

  async updateSupplier(user: AuthUser, supplierId: string, payload: SupplierInput) {
    const scope = getTenantScope(user);
    const supplier = await Supplier.findOne({ where: { id: supplierId, companyId: scope.companyId } });
    if (!supplier) throw new HttpError(404, 'Proveedor no encontrado.');
    const businessName = payload.businessName.trim();
    if (!businessName) throw new HttpError(400, 'El nombre del proveedor es obligatorio.');
    const businessNameNormalized = normalizeText(businessName);
    const duplicate = await Supplier.findOne({
      where: { companyId: scope.companyId, businessNameNormalized, id: { [Op.ne]: supplier.id } },
    });
    if (duplicate) throw new HttpError(409, 'Ya existe un proveedor con ese nombre en la empresa.');
    if (payload.taxId?.trim()) {
      const taxIdExists = await Supplier.findOne({
        where: { companyId: scope.companyId, taxId: payload.taxId.trim(), id: { [Op.ne]: supplier.id } },
      });
      if (taxIdExists) throw new HttpError(409, 'Ya existe un proveedor con ese identificador fiscal en la empresa.');
    }
    supplier.businessName = businessName;
    supplier.businessNameNormalized = businessNameNormalized;
    supplier.taxId = payload.taxId?.trim() || null;
    supplier.email = payload.email?.trim().toLowerCase() || null;
    supplier.phone = payload.phone?.trim() || null;
    supplier.address = payload.address?.trim() || null;
    await supplier.save();
    return supplier;
  }

  async setSupplierActive(user: AuthUser, supplierId: string, isActive: boolean) {
    const scope = getTenantScope(user);
    const supplier = await Supplier.findOne({ where: { id: supplierId, companyId: scope.companyId } });
    if (!supplier) throw new HttpError(404, 'Proveedor no encontrado.');
    supplier.isActive = isActive;
    await supplier.save();
  }

  private async findProductForUser(user: AuthUser, productId: string) {
    const scope = getTenantScope(user);
    const product = await Product.findOne({
      where: {
        id: productId,
        companyId: scope.companyId,
        ...(scope.localId ? { localId: scope.localId } : {}),
      },
      paranoid: false,
    });
    if (!product) throw new HttpError(404, 'Producto no encontrado.');
    return product;
  }

  private async findLocal(localId: string, companyId: string, restrictedLocalId: string | null) {
    const local = await Local.findOne({
      where: { id: localId, companyId, isActive: true, ...(restrictedLocalId ? { id: restrictedLocalId } : {}) },
    });
    if (!local) throw new HttpError(403, 'La sucursal no pertenece a la empresa activa o no tienes acceso.');
    return local;
  }

  private validateProductInput(payload: ProductInput) {
    if (!payload.name.trim() || !payload.unit.trim()) throw new HttpError(400, 'Nombre y unidad son obligatorios.');
    if (!Number.isFinite(payload.salePrice) || payload.salePrice < 0) throw new HttpError(400, 'El precio de venta no es válido.');
    if (!Number.isFinite(payload.initialQuantity) || payload.initialQuantity < 0) {
      throw new HttpError(400, 'El stock inicial no puede ser negativo.');
    }
    if (
      payload.currentQuantity !== undefined &&
      (!Number.isFinite(payload.currentQuantity) || payload.currentQuantity < 0)
    ) {
      throw new HttpError(400, 'El stock no puede ser negativo.');
    }
  }

  private async ensureCategoryNameAvailable(nameNormalized: string, localId: string, excludeId?: string) {
    const category = await Category.findOne({
      where: { localId, nameNormalized, ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}) },
      paranoid: false,
    });
    if (category) throw new HttpError(409, 'Ya existe una categoría con ese nombre en la sucursal.');
  }

  private async ensureProductNameAvailable(
    nameNormalized: string,
    localId: string,
    transaction?: Transaction,
    excludeId?: string,
  ) {
    const product = await Product.findOne({
      where: { localId, nameNormalized, ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}) },
      transaction,
      paranoid: false,
    });
    if (product) throw new HttpError(409, 'Ya existe un producto con ese nombre en la sucursal.');
  }

  private async ensureProductSkuAvailable(sku: string, localId: string, transaction?: Transaction, excludeId?: string) {
    const product = await Product.findOne({
      where: { localId, sku, ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}) },
      transaction,
      paranoid: false,
    });
    if (product) throw new HttpError(409, 'Ya existe un producto con ese código en la sucursal.');
  }
}

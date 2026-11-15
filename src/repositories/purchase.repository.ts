import { Includeable, Transaction } from 'sequelize';
import { Purchase, PurchaseDetail, Product, Supplier, User } from '../models';
import { CreatePurchaseDto } from '../interfaces/dto.interface';
import { PurchaseStatus } from '../enums/purchase-status.enum';
import { TenantScope } from '../utils/tenant-scope.util';

const purchaseIncludes = (companyId: string, localId?: string | null): Includeable[] => [
  { model: Supplier, where: { companyId }, required: false },
  { model: User, as: 'createdBy', where: { companyId }, required: false },
  {
    model: PurchaseDetail,
    as: 'details',
    include: [{ model: Product, where: { companyId, ...(localId ? { localId } : {}) }, required: false }],
  },
];

export class PurchaseRepository {
  async listAll(scope: TenantScope): Promise<Purchase[]> {
    const where = {
      companyId: scope.companyId,
      ...(scope.localId ? { localId: scope.localId } : {}),
    };
    return Purchase.findAll({
      where,
      include: purchaseIncludes(scope.companyId, scope.localId),
      order: [['createdAt', 'DESC']],
    });
  }

  async findByIdWithDetails(id: string, scope: TenantScope, transaction?: Transaction): Promise<Purchase | null> {
    return Purchase.findOne({
      where: {
        id,
        companyId: scope.companyId,
        ...(scope.localId ? { localId: scope.localId } : {}),
      },
      include: purchaseIncludes(scope.companyId, scope.localId),
      transaction,
    });
  }

  async createWithDetails(
    payload: CreatePurchaseDto,
    actorUserId: string,
    companyId: string,
    localId: string,
    purchaseNumber: string,
    subtotal: number,
    transaction: Transaction,
  ): Promise<Purchase> {
    const purchase = await Purchase.create(
      {
        supplierId: payload.supplierId,
        createdByUserId: actorUserId,
        companyId,
        localId,
        purchaseDate: payload.purchaseDate,
        observations: payload.observations ?? null,
        purchaseNumber,
        status: PurchaseStatus.PENDIENTE,
        subtotal,
        total: subtotal,
      },
      { transaction },
    );

    await PurchaseDetail.bulkCreate(
      payload.details.map((detail) => ({
        purchaseId: purchase.id,
        productId: detail.productId,
        quantity: detail.quantity,
        unitCost: detail.unitCost,
        lineTotal: Number((detail.quantity * detail.unitCost).toFixed(2)),
      })),
      { transaction },
    );

    return purchase;
  }

  async updateStatus(id: string, status: PurchaseStatus, transaction: Transaction): Promise<void> {
    await Purchase.update(
      {
        status,
        receivedAt: status === PurchaseStatus.RECIBIDA ? new Date() : null,
      },
      { where: { id }, transaction },
    );
  }
}
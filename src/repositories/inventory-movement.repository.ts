import { Transaction } from 'sequelize';
import { InventoryMovement, Product, Stock } from '../models';
import { TenantScope } from '../utils/tenant-scope.util';
import { Op } from 'sequelize';

interface CreateMovementInput {
  productId: string;
  stockId: string;
  createdByUserId: string;
  movementType: string;
  originType: string;
  originId: string;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  notes?: string;
}

export class InventoryMovementRepository {
  async create(input: CreateMovementInput, transaction: Transaction): Promise<void> {
    await InventoryMovement.create(
      {
        ...input,
        movementDate: new Date(),
        notes: input.notes ?? null,
      },
      { transaction },
    );
  }

  async listRecent(scope: TenantScope, limit = 50): Promise<InventoryMovement[]> {
    return InventoryMovement.findAll({
      include: [
        { model: Product, where: { companyId: scope.companyId }, required: true },
        { model: Stock, where: scope.localId ? { localId: scope.localId } : { localId: { [Op.ne]: null } }, required: true },
      ],
      order: [['movementDate', 'DESC']],
      limit,
    });
  }
}
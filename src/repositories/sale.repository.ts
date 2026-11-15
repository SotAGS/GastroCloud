import { FindOptions, Includeable, Transaction } from 'sequelize';
import { Product, Sale, SaleDetail } from '../models';
import { SaleStatus } from '../enums/sale-status.enum';
import { TenantScope } from '../utils/tenant-scope.util';

const saleIncludes = (companyId: string, localId?: string | null): Includeable[] => [
  {
    model: SaleDetail,
    as: 'details',
    include: [{ model: Product, where: { companyId, ...(localId ? { localId } : {}) }, required: false }],
  },
];

export class SaleRepository {
  async listAll(scope: TenantScope): Promise<Sale[]> {
    return Sale.findAll({
      where: {
        companyId: scope.companyId,
        ...(scope.localId ? { localId: scope.localId } : {}),
      },
      include: saleIncludes(scope.companyId, scope.localId),
      order: [['soldAt', 'DESC']],
    });
  }

  async findById(id: string, scope: TenantScope, transaction: Transaction, lockForUpdate = false): Promise<Sale | null> {
    const options: FindOptions = {
      where: {
        id,
        companyId: scope.companyId,
        ...(scope.localId ? { localId: scope.localId } : {}),
      },
      include: saleIncludes(scope.companyId, scope.localId),
      transaction,
    };
    if (lockForUpdate) {
      options.lock = { level: transaction.LOCK.UPDATE, of: Sale };
    }
    return Sale.findOne(options);
  }

  async create(
    input: {
      companyId: string;
      localId: string;
      createdByUserId: string;
      saleNumber: string;
      total: number;
      details: Array<{ productId: string; quantity: number; unitPrice: number; lineTotal: number }>;
    },
    transaction: Transaction,
  ): Promise<Sale> {
    const sale = await Sale.create(
      {
        companyId: input.companyId,
        localId: input.localId,
        createdByUserId: input.createdByUserId,
        saleNumber: input.saleNumber,
        total: input.total,
        status: SaleStatus.COMPLETED,
      },
      { transaction },
    );

    await SaleDetail.bulkCreate(
      input.details.map((detail) => ({ ...detail, saleId: sale.id })),
      { transaction },
    );

    return sale;
  }
}

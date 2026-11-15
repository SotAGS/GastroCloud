import { Op, Transaction } from 'sequelize';
import { Stock } from '../models';
import { TenantScope } from '../utils/tenant-scope.util';

export class StockRepository {
  async findByProductId(productId: string, localId: string, transaction: Transaction): Promise<Stock | null> {
    return Stock.findOne({ where: { productId, localId }, transaction, lock: transaction.LOCK.UPDATE });
  }

  async createInitial(productId: string, localId: string, transaction: Transaction): Promise<Stock> {
    return Stock.create(
      {
        productId,
        localId,
        currentQuantity: 0,
        minimumQuantity: 0,
        maximumQuantity: null,
      },
      { transaction },
    );
  }

  async save(stock: Stock, transaction: Transaction): Promise<void> {
    await stock.save({ transaction });
  }

  async listAll(scope: TenantScope): Promise<Stock[]> {
    return Stock.findAll({
      where: scope.localId ? { localId: scope.localId } : { localId: { [Op.ne]: null } },
      include: [{ association: 'product', where: { companyId: scope.companyId }, required: true }],
      order: [['updatedAt', 'DESC']],
    });
  }
}
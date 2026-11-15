import { Op, Transaction } from 'sequelize';
import { Product } from '../models';

export class ProductRepository {
  async countActiveByIds(ids: string[], companyId: string, transaction?: Transaction, localId?: string): Promise<number> {
    return Product.count({
      where: { id: { [Op.in]: ids }, companyId, ...(localId ? { localId } : {}), isActive: true },
      transaction,
    });
  }

  async listAvailableForSale(companyId: string, localId: string): Promise<Product[]> {
    return Product.findAll({
      where: { companyId, localId, isActive: true },
      include: [
        {
          association: 'stocks',
          where: { localId, currentQuantity: { [Op.gt]: 0 } },
          required: true,
        },
      ],
      order: [['name', 'ASC']],
    });
  }

  async findActiveByIds(ids: string[], companyId: string, localId: string, transaction: Transaction): Promise<Product[]> {
    return Product.findAll({
      where: { id: { [Op.in]: ids }, companyId, localId, isActive: true },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }
}
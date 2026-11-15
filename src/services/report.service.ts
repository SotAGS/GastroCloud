import { Op, col, fn } from 'sequelize';
import { PurchaseStatus } from '../enums/purchase-status.enum';
import { SaleStatus } from '../enums/sale-status.enum';
import { AuthUser } from '../interfaces/auth-user.interface';
import { InventoryMovement, Local, Product, Purchase, Sale, Stock } from '../models';
import { getTenantScope } from '../utils/tenant-scope.util';

export class ReportService {
  async getCompanyReport(user: AuthUser) {
    const { companyId } = getTenantScope(user);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [todaySales, monthSales, monthPurchases, monthlySales, localTotals, recentSales, stocks, movementCount] =
      await Promise.all([
        Sale.sum('total', {
          where: { companyId, status: SaleStatus.COMPLETED, soldAt: { [Op.gte]: todayStart } },
        }),
        Sale.sum('total', {
          where: { companyId, status: SaleStatus.COMPLETED, soldAt: { [Op.gte]: monthStart } },
        }),
        Purchase.sum('total', {
          where: { companyId, status: PurchaseStatus.RECIBIDA, purchaseDate: { [Op.gte]: monthStart } },
        }),
        Sale.findAll({
          attributes: [
            [fn('date_trunc', 'month', col('sold_at')), 'month'],
            [fn('sum', col('total')), 'total'],
            [fn('count', col('id')), 'count'],
          ],
          where: {
            companyId,
            status: SaleStatus.COMPLETED,
            soldAt: { [Op.gte]: yearStart },
          },
          group: [fn('date_trunc', 'month', col('sold_at'))],
          order: [[fn('date_trunc', 'month', col('sold_at')), 'ASC']],
          raw: false,
        }),
        Sale.findAll({
          attributes: ['localId', [fn('sum', col('total')), 'total'], [fn('count', col('id')), 'count']],
          where: { companyId, status: SaleStatus.COMPLETED, soldAt: { [Op.gte]: monthStart } },
          group: ['local_id'],
          raw: false,
        }),
        Sale.findAll({
          where: { companyId },
          include: [{ model: Local, attributes: ['id', 'name'] }],
          order: [['soldAt', 'DESC']],
          limit: 15,
        }),
        Stock.findAll({
          include: [
            { model: Product, where: { companyId }, attributes: ['id', 'name', 'unit'] },
            { model: Local, where: { companyId }, attributes: ['id', 'name'] },
          ],
          order: [['currentQuantity', 'ASC']],
        }),
        InventoryMovement.count({ include: [{ model: Product, where: { companyId }, attributes: [] }] }),
      ]);

    const locals = await Local.findAll({
      where: { companyId },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
    });
    const localTotalsById = new Map(
      localTotals.map((row) => [
        String(row.get('localId')),
        { total: Number(row.get('total')), count: Number(row.get('count')) },
      ]),
    );
    const lowStock = stocks.filter((stock) => Number(stock.currentQuantity) <= Number(stock.minimumQuantity));

    return {
      todaySales: Number(todaySales ?? 0),
      monthSales: Number(monthSales ?? 0),
      monthPurchases: Number(monthPurchases ?? 0),
      monthlySales: monthlySales.map((row) => {
        const month = row.get('month');
        const monthDate = month instanceof Date ? month : new Date(String(month));
        return {
          month: monthDate.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' }),
          total: Number(row.get('total')),
          count: Number(row.get('count')),
        };
      }),
      salesByLocal: locals.map((local) => {
        const total = localTotalsById.get(local.id);
        return { name: local.name, total: Number(total?.total ?? 0), count: Number(total?.count ?? 0) };
      }),
      recentSales,
      lowStock,
      movementCount,
    };
  }
}

import { Supplier } from '../models';
import { Op } from 'sequelize';

export class SupplierRepository {
  async findActiveById(id: string, companyId: string): Promise<Supplier | null> {
    return Supplier.findOne({ where: { id, companyId, isActive: true } });
  }

  async listActive(companyId: string): Promise<Supplier[]> {
    return Supplier.findAll({ where: { companyId, isActive: true }, order: [['businessName', 'ASC']] });
  }
}
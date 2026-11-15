import { Table, Model, Column, DataType, HasMany, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Purchase } from './purchase.model';
import { Company } from './company.model';

@Table({
  tableName: 'supplier',
  timestamps: true,
  paranoid: true,
  indexes: [
    { name: 'supplier_company_name_normalized_uq', unique: true, fields: ['company_id', 'business_name_normalized'] },
    { name: 'supplier_company_tax_id_uq', unique: true, fields: ['company_id', 'tax_id'] },
  ],
})
export class Supplier extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(150), allowNull: false })
  declare businessName: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: true })
  declare companyId: string | null;

  @Column({ type: DataType.STRING(150), allowNull: false })
  declare businessNameNormalized: string;

  @Column({ type: DataType.STRING(30), allowNull: true })
  declare taxId: string | null;

  @Column({ type: DataType.STRING(120), allowNull: true })
  declare email: string | null;

  @Column({ type: DataType.STRING(30), allowNull: true })
  declare phone: string | null;

  @Column({ type: DataType.STRING(200), allowNull: true })
  declare address: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare isActive: boolean;

  @HasMany(() => Purchase)
  declare purchases: Purchase[];

  @BelongsTo(() => Company)
  declare company: Company | null;
}
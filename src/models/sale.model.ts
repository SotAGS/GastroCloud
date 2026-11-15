import { Table, Model, Column, DataType, ForeignKey, BelongsTo, HasMany } from 'sequelize-typescript';
import { Company } from './company.model';
import { Local } from './local.model';
import { User } from './user.model';
import { SaleDetail } from './sale-detail.model';
import { SaleStatus } from '../enums/sale-status.enum';

@Table({
  tableName: 'sale',
  timestamps: true,
  indexes: [{ name: 'sale_company_number_uq', unique: true, fields: ['company_id', 'sale_number'] }],
})
export class Sale extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: false })
  declare companyId: string;

  @ForeignKey(() => Local)
  @Column({ type: DataType.UUID, allowNull: false })
  declare localId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  declare createdByUserId: string;

  @Column({ type: DataType.STRING(30), allowNull: false })
  declare saleNumber: string;

  @Column({ type: DataType.ENUM(...Object.values(SaleStatus)), allowNull: false, defaultValue: SaleStatus.COMPLETED })
  declare status: SaleStatus;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare soldAt: Date;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false, defaultValue: 0 })
  declare total: number;

  @Column({ type: DataType.DATE, allowNull: true })
  declare cancelledAt: Date | null;

  @BelongsTo(() => Company)
  declare company: Company;

  @BelongsTo(() => Local)
  declare local: Local;

  @BelongsTo(() => User, { as: 'createdBy' })
  declare createdBy: User;

  @HasMany(() => SaleDetail, { as: 'details' })
  declare details: SaleDetail[];
}

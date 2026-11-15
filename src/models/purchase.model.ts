import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { Supplier } from './supplier.model';
import { User } from './user.model';
import { PurchaseDetail } from './purchase-detail.model';
import { PurchaseStatus } from '../enums/purchase-status.enum';
import { Company } from './company.model';
import { Local } from './local.model';

@Table({
  tableName: 'purchase',
  timestamps: true,
  indexes: [{ name: 'purchase_company_number_uq', unique: true, fields: ['company_id', 'purchase_number'] }],
})
export class Purchase extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Supplier)
  @Column({ type: DataType.UUID, allowNull: false })
  declare supplierId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  declare createdByUserId: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: true })
  declare companyId: string | null;

  @ForeignKey(() => Local)
  @Column({ type: DataType.UUID, allowNull: true })
  declare localId: string | null;

  @Column({ type: DataType.STRING(30), allowNull: false })
  declare purchaseNumber: string;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  declare purchaseDate: string;

  @Column({ type: DataType.ENUM(...Object.values(PurchaseStatus)), allowNull: false })
  declare status: PurchaseStatus;

  @Column({ type: DataType.STRING(300), allowNull: true })
  declare observations: string | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false, defaultValue: 0 })
  declare subtotal: number;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false, defaultValue: 0 })
  declare total: number;

  @Column({ type: DataType.DATE, allowNull: true })
  declare receivedAt: Date | null;

  @BelongsTo(() => Supplier)
  declare supplier: Supplier;

  @BelongsTo(() => User)
  declare createdBy: User;

  @BelongsTo(() => Company)
  declare company: Company | null;

  @BelongsTo(() => Local)
  declare local: Local | null;

  @HasMany(() => PurchaseDetail)
  declare details: PurchaseDetail[];
}
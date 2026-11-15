import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { Company } from './company.model';

@Table({
  tableName: 'payment_attempt',
  timestamps: true,
  indexes: [{ name: 'payment_attempt_company_created_idx', fields: ['company_id', 'created_at'] }],
})
export class PaymentAttempt extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: false })
  declare companyId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare createdByUserId: string;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare preferenceId: string;

  @Column({ type: DataType.STRING(30), allowNull: false })
  declare collectorId: string;

  @Column({ type: DataType.STRING(500), allowNull: false })
  declare checkoutUrl: string;

  @Column({ type: DataType.STRING(30), allowNull: true, unique: true })
  declare providerPaymentId: string | null;

  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: 'PENDING' })
  declare status: string;

  @Column({ type: DataType.DATE, allowNull: true })
  declare paidAt: Date | null;

  @BelongsTo(() => Company)
  declare company: Company;
}

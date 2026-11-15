import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'support_activity',
  timestamps: true,
  updatedAt: false,
  indexes: [{ name: 'support_activity_company_created_idx', fields: ['company_id', 'created_at'] }],
})
export class SupportActivity extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare companyId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare userName: string;

  @Column({ type: DataType.STRING(20), allowNull: false })
  declare actorType: string;

  @Column({ type: DataType.STRING(10), allowNull: false })
  declare method: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare path: string;

  @Column({ type: DataType.STRING(20), allowNull: false })
  declare action: string;

  @Column({ type: DataType.DATE, allowNull: false })
  declare createdAt: Date;
}

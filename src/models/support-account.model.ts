import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { User } from './user.model';

@Table({ tableName: 'support_account', timestamps: true })
export class SupportAccount extends Model {
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, primaryKey: true })
  declare userId: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare canManageSupport: boolean;

  @BelongsTo(() => User)
  declare user: User;
}

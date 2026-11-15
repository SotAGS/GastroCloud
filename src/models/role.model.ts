import { Table, Model, Column, DataType, HasMany, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { User } from './user.model';
import { RolePermission } from './role-permission.model';
import { Company } from './company.model';

@Table({ tableName: 'role', timestamps: true })
export class Role extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: true })
  declare companyId: string | null;

  @Column({ type: DataType.STRING(30), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(150), allowNull: true })
  declare description: string | null;

  @HasMany(() => User)
  declare users: User[];

  @HasMany(() => RolePermission)
  declare permissions: RolePermission[];

  @BelongsTo(() => Company)
  declare company: Company | null;
}
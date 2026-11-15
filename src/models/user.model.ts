import { Table, Model, Column, DataType, ForeignKey, BelongsTo, HasMany } from 'sequelize-typescript';
import { Role } from './role.model';
import { Purchase } from './purchase.model';
import { InventoryMovement } from './inventory-movement.model';
import { Company } from './company.model';
import { Local } from './local.model';

@Table({ tableName: 'user', timestamps: true, paranoid: true })
export class User extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Role)
  @Column({ type: DataType.UUID, allowNull: false })
  declare roleId: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: true })
  declare companyId: string | null;

  @ForeignKey(() => Local)
  @Column({ type: DataType.UUID, allowNull: true })
  declare localId: string | null;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare fullName: string;

  @Column({ type: DataType.STRING(50), allowNull: false, unique: true })
  declare username: string;

  @Column({ type: DataType.STRING(120), allowNull: false, unique: true })
  declare email: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare passwordHash: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare isActive: boolean;

  @Column({ type: DataType.DATE, allowNull: true })
  declare lastLoginAt: Date | null;

  @BelongsTo(() => Role)
  declare role: Role;

  @BelongsTo(() => Company)
  declare company: Company;

  @BelongsTo(() => Local)
  declare local: Local;

  @HasMany(() => Purchase)
  declare purchases: Purchase[];

  @HasMany(() => InventoryMovement)
  declare inventoryMovements: InventoryMovement[];
}
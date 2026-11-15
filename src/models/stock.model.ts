import { Table, Model, Column, DataType, ForeignKey, BelongsTo, HasMany } from 'sequelize-typescript';
import { Product } from './product.model';
import { InventoryMovement } from './inventory-movement.model';
import { Local } from './local.model';

@Table({
  tableName: 'stock',
  timestamps: true,
  indexes: [{ name: 'stock_local_product_uq', unique: true, fields: ['local_id', 'product_id'] }],
})
export class Stock extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Local)
  @Column({ type: DataType.UUID, allowNull: true })
  declare localId: string | null;

  @ForeignKey(() => Product)
  @Column({ type: DataType.UUID, allowNull: false })
  declare productId: string;

  @Column({ type: DataType.DECIMAL(14, 3), allowNull: false, defaultValue: 0 })
  declare currentQuantity: number;

  @Column({ type: DataType.DECIMAL(14, 3), allowNull: false, defaultValue: 0 })
  declare minimumQuantity: number;

  @Column({ type: DataType.DECIMAL(14, 3), allowNull: true })
  declare maximumQuantity: number | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare lastMovementAt: Date | null;

  @BelongsTo(() => Product)
  declare product: Product;

  @BelongsTo(() => Local)
  declare local: Local | null;

  @HasMany(() => InventoryMovement)
  declare movements: InventoryMovement[];
}

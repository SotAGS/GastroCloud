import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from 'sequelize-typescript';
import { Category } from './category.model';
import { Stock } from './stock.model';
import { PurchaseDetail } from './purchase-detail.model';
import { InventoryMovement } from './inventory-movement.model';
import { Company } from './company.model';
import { Local } from './local.model';

@Table({
  tableName: 'product',
  timestamps: true,
  paranoid: true,
  indexes: [
    { name: 'product_local_sku_uq', unique: true, fields: ['local_id', 'sku'] },
    { name: 'product_local_name_normalized_uq', unique: true, fields: ['local_id', 'name_normalized'] },
  ],
})
export class Product extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Category)
  @Column({ type: DataType.UUID, allowNull: false })
  declare categoryId: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: true })
  declare companyId: string | null;

  @ForeignKey(() => Local)
  @Column({ type: DataType.UUID, allowNull: true })
  declare localId: string | null;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare sku: string | null;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare nameNormalized: string;

  @Column({ type: DataType.STRING(300), allowNull: true })
  declare description: string | null;

  @Column({ type: DataType.STRING(20), allowNull: false })
  declare unit: string;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false, defaultValue: 0 })
  declare salePrice: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare isActive: boolean;

  @BelongsTo(() => Category)
  declare category: Category;

  @BelongsTo(() => Company)
  declare company: Company | null;

  @BelongsTo(() => Local)
  declare local: Local | null;

  @HasMany(() => Stock)
  declare stocks: Stock[];

  @HasMany(() => PurchaseDetail)
  declare purchaseDetails: PurchaseDetail[];

  @HasMany(() => InventoryMovement)
  declare inventoryMovements: InventoryMovement[];
}
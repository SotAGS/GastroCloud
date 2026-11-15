import { Table, Model, Column, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Sale } from './sale.model';
import { Product } from './product.model';

@Table({ tableName: 'sale_detail', timestamps: true })
export class SaleDetail extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Sale)
  @Column({ type: DataType.UUID, allowNull: false })
  declare saleId: string;

  @ForeignKey(() => Product)
  @Column({ type: DataType.UUID, allowNull: false })
  declare productId: string;

  @Column({ type: DataType.DECIMAL(14, 3), allowNull: false })
  declare quantity: number;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false })
  declare unitPrice: number;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false })
  declare lineTotal: number;

  @BelongsTo(() => Sale)
  declare sale: Sale;

  @BelongsTo(() => Product)
  declare product: Product;
}

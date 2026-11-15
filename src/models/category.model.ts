import { Table, Model, Column, DataType, HasMany, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Product } from './product.model';
import { Company } from './company.model';
import { Local } from './local.model';

@Table({
  tableName: 'category',
  timestamps: true,
  paranoid: true,
  indexes: [{ name: 'category_local_name_normalized_uq', unique: true, fields: ['local_id', 'name_normalized'] }],
})
export class Category extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare name: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: true })
  declare companyId: string | null;

  @ForeignKey(() => Local)
  @Column({ type: DataType.UUID, allowNull: true })
  declare localId: string | null;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare nameNormalized: string;

  @Column({ type: DataType.STRING(200), allowNull: true })
  declare description: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare isActive: boolean;

  @HasMany(() => Product)
  declare products: Product[];

  @BelongsTo(() => Company)
  declare company: Company | null;

  @BelongsTo(() => Local)
  declare local: Local | null;
}

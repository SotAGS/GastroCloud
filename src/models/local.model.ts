import { Table, Model, Column, DataType, ForeignKey, BelongsTo, HasMany } from 'sequelize-typescript';
import { Company } from './company.model';
import { User } from './user.model';
import { Product } from './product.model';
import { Category } from './category.model';
import { Stock } from './stock.model';

@Table({ tableName: 'local', timestamps: true, paranoid: true })
export class Local extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.UUID, allowNull: false })
  declare companyId: string;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(200), allowNull: true })
  declare address: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare isActive: boolean;

  @BelongsTo(() => Company)
  declare company: Company;

  @HasMany(() => User, 'localId')
  declare employees: User[];

  @HasMany(() => Product)
  declare products: Product[];

  @HasMany(() => Category)
  declare categories: Category[];

  @HasMany(() => Stock)
  declare stocks: Stock[];
}

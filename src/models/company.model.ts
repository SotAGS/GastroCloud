import { Table, Model, Column, DataType, HasMany } from 'sequelize-typescript';
import { Local } from './local.model';
import { User } from './user.model';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';

@Table({ tableName: 'company', timestamps: true, paranoid: true })
export class Company extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(150), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(120), allowNull: false, unique: true })
  declare slug: string;

  @Column({
    type: DataType.ENUM(...Object.values(SubscriptionPlan)),
    allowNull: false,
    defaultValue: SubscriptionPlan.FREEMIUM,
  })
  declare subscriptionPlan: SubscriptionPlan;

  @Column({ type: DataType.STRING(30), allowNull: false, defaultValue: 'ACTIVE' })
  declare subscriptionStatus: string;

  @Column({ type: DataType.DATE, allowNull: true })
  declare premiumExpiresAt: Date | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare isActive: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare isSupportOperator: boolean;

  @HasMany(() => Local)
  declare locals: Local[];

  @HasMany(() => User)
  declare users: User[];
}

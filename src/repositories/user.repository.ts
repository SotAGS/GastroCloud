import { User } from '../models';
import { Op } from 'sequelize';
import { UserRole } from '../enums/user-role.enum';

export class UserRepository {
  async findByUsernameOrEmail(identifier: string): Promise<User | null> {
    return User.findOne({
      where: {
        [Op.or]: [{ username: identifier }, { email: identifier }],
      },
      include: [
        {
          association: 'role',
          include: ['permissions'],
        },
        'company',
        'local',
      ],
    });
  }

  async updateLastLogin(userId: string): Promise<void> {
    await User.update({ lastLoginAt: new Date() }, { where: { id: userId } });
  }

  async listWithRole(companyId: string): Promise<User[]> {
    return User.findAll({
      where: { companyId },
      include: ['role', 'local'],
      order: [['fullName', 'ASC']],
    });
  }

  async findById(userId: string, companyId: string): Promise<User | null> {
    return User.findOne({ where: { id: userId, companyId }, include: ['role'] });
  }

  async countAdmins(): Promise<number> {
    return User.count({
      include: [
        {
          association: 'role',
          where: { name: UserRole.ADMIN },
          required: true,
        },
      ],
    });
  }

  async updateSecurityProfile(userId: string, roleId: string, isActive: boolean, companyId: string): Promise<void> {
    await User.update({ roleId, isActive }, { where: { id: userId, companyId } });
  }
}
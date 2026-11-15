import { Router } from 'express';
import bcrypt from 'bcrypt';
import { body, param, validationResult } from 'express-validator';
import { sequelize } from '../config/database.config';
import { UserRole } from '../enums/user-role.enum';
import { requireAuth } from '../middlewares/auth.middleware';
import { Company, Role, SupportAccount, SupportActivity, User } from '../models';
import { HttpError } from '../utils/http-error.util';
import { Op } from 'sequelize';

const router = Router();

router.use(requireAuth, (req, _res, next) => {
  if (!req.session.support || !req.session.user) {
    next(new HttpError(403, 'Acceso reservado a soporte de GastroCloud.'));
    return;
  }
  next();
});

router.get('/cambiar-clave', (req, res) => {
  res.render('soporte/cambiar-clave', { user: req.session.user });
});

router.post('/cambiar-clave', async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword ?? '');
    const password = String(req.body.password ?? '');
    if (Array.from(password).length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new HttpError(400, 'La nueva contraseña debe tener al menos 12 caracteres y no superar 72 bytes.');
    }
    const user = await User.findByPk(req.session.user!.id, { rejectOnEmpty: true });
    if (!await bcrypt.compare(currentPassword, user.passwordHash)) {
      throw new HttpError(403, 'La contraseña actual no es correcta.');
    }
    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();
    req.session.support!.mustChangePassword = false;
    req.session.save((error) => {
      if (error) next(error);
      else res.redirect('/soporte');
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const support = req.session.support!;
    if (support.targetCompanyId) {
      res.redirect('/dashboard');
      return;
    }
    const companies = await Company.findAll({
      where: { id: { [Op.ne]: support.homeCompanyId }, isSupportOperator: false },
      order: [['name', 'ASC']],
    });
    const accounts = support.canManageSupport
      ? await SupportAccount.findAll({
          include: [{ model: User, where: { companyId: support.homeCompanyId }, required: true }],
          order: [['userId', 'ASC']],
        })
      : [];
    res.render('soporte/index', { user: req.session.user, companies, accounts, canManageSupport: support.canManageSupport });
  } catch (error) {
    next(error);
  }
});

router.post('/acceder/:companyId', param('companyId').isUUID(), async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) {
      throw new HttpError(400, 'Empresa inválida.');
    }
    const support = req.session.support!;
    const user = req.session.user!;
    const company = await Company.findByPk(String(req.params?.companyId ?? ''));
    if (!company || company.isSupportOperator || company.id === support.homeCompanyId) {
      throw new HttpError(404, 'Empresa no disponible.');
    }
    if (support.targetCompanyId) {
      throw new HttpError(409, 'Vuelve al panel de soporte antes de cambiar de empresa.');
    }
    await SupportActivity.create({
      companyId: company.id,
      userId: user.id,
      userName: (await User.findByPk(user.id, { rejectOnEmpty: true })).username,
      actorType: support.canManageSupport ? 'ADMIN_GC' : 'SOPORTE_GC',
      method: 'POST',
      path: '/soporte/acceder',
      action: 'INGRESO',
    });
    support.targetCompanyId = company.id;
    req.session.save((error) => {
      if (error) next(error);
      else res.redirect('/dashboard');
    });
  } catch (error) {
    next(error);
  }
});

router.post('/volver', async (req, res, next) => {
  try {
    const support = req.session.support!;
    const user = req.session.user!;
    if (support.targetCompanyId) {
      await SupportActivity.create({
        companyId: support.targetCompanyId,
        userId: user.id,
        userName: (await User.findByPk(user.id, { rejectOnEmpty: true })).username,
        actorType: support.canManageSupport ? 'ADMIN_GC' : 'SOPORTE_GC',
        method: 'POST',
        path: '/soporte/volver',
        action: 'SALIDA',
      });
    }
    support.targetCompanyId = null;
    user.companyId = support.homeCompanyId;
    user.localId = support.homeLocalId;
    req.session.save((error) => {
      if (error) next(error);
      else res.redirect('/soporte');
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/cuentas',
  body('fullName').trim().notEmpty().isLength({ max: 120 }),
  body('username').trim().matches(/^[a-zA-Z0-9._-]{1,50}$/),
  body('email').trim().isEmail().normalizeEmail().isLength({ max: 120 }),
  body('password').isLength({ min: 12, max: 72 }),
  async (req, res, next) => {
    try {
      const support = req.session.support!;
      if (!support.canManageSupport || support.targetCompanyId) {
        throw new HttpError(403, 'Solo un administrador de GastroCloud puede crear cuentas de soporte.');
      }
      if (!validationResult(req).isEmpty() || Buffer.byteLength(req.body.password, 'utf8') > 72) {
        throw new HttpError(400, 'Revisa los datos. La contraseña debe tener entre 12 y 72 caracteres.');
      }
      const passwordHash = await bcrypt.hash(req.body.password, 10);
      await sequelize.transaction(async (transaction) => {
        const role = await Role.findOne({
          where: { name: UserRole.EMPLEADO, companyId: null },
          transaction,
          rejectOnEmpty: true,
        });
        const user = await User.create({
          roleId: role.id,
          companyId: support.homeCompanyId,
          localId: support.homeLocalId,
          fullName: req.body.fullName,
          username: req.body.username,
          email: req.body.email,
          passwordHash,
          isActive: true,
        }, { transaction });
        await SupportAccount.create({ userId: user.id, canManageSupport: false }, { transaction });
      });
      res.redirect('/soporte');
    } catch (error) {
      next(error);
    }
  },
);

export default router;

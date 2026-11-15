import { Router } from 'express';
import bcrypt from 'bcrypt';
import { UserRole } from '../enums/user-role.enum';
import { requireAuth } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/role.middleware';
import { Company } from '../models';
import { HttpError } from '../utils/http-error.util';
import { hasSameOrigin } from '../utils/request-origin.util';
import { requireCompanyAdministrator } from '../services/company-administrator.service';

const router = Router();

router.get('/', requireAuth, requireRole(UserRole.ADMIN), (req, res) => {
  res.render('empresa/index', { user: req.session.user });
});

router.post('/baja', requireAuth, requireRole(UserRole.ADMIN), async (req, res, next) => {
  try {
    if (!hasSameOrigin(req)) {
      throw new HttpError(403, 'La solicitud no tiene un origen válido.');
    }
    if (String(req.body.confirmation ?? '').trim() !== 'DAR DE BAJA') {
      throw new HttpError(400, 'Escribe DAR DE BAJA para confirmar.');
    }
    const companyId = req.session.user?.companyId;
    const actor = await requireCompanyAdministrator(req.session.user);
    if (!await bcrypt.compare(String(req.body.password ?? ''), actor.passwordHash)) {
      throw new HttpError(403, 'La contraseña no es correcta.');
    }

    const [updated] = await Company.update(
      { isActive: false },
      { where: { id: companyId, isActive: true, isSupportOperator: false } },
    );
    if (updated !== 1) {
      throw new HttpError(409, 'No se pudo dar de baja la empresa.');
    }
    req.session.destroy((error) => {
      if (error) next(error);
      else res.redirect('/auth/login?reason=company-inactive');
    });
  } catch (error) {
    next(error);
  }
});

export default router;

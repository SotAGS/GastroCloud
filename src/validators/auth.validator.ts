import { body } from 'express-validator';

export const loginValidator = [
  body('usernameOrEmail').trim().notEmpty().withMessage('Usuario o email es obligatorio.'),
  body('password').notEmpty().withMessage('Contrasena es obligatoria.'),
];

export const registerValidator = [
  body('companyName').trim().notEmpty().withMessage('El nombre de la empresa es obligatorio.'),
  body('localName').trim().notEmpty().withMessage('El nombre de la sucursal es obligatorio.'),
  body('email').trim().isEmail().withMessage('El correo es invalido.').normalizeEmail(),
  body('password').notEmpty().withMessage('La contraseña es obligatoria.'),
];
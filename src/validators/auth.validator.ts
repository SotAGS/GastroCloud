import { body } from 'express-validator';

export const loginValidator = [
  body('usernameOrEmail').trim().notEmpty().withMessage('Usuario o email es obligatorio.'),
  body('password').notEmpty().withMessage('Contrasena es obligatoria.'),
];

export const registerValidator = [
  body('fullName').trim().notEmpty().withMessage('El nombre completo es obligatorio.'),
  body('companyName').trim().notEmpty().withMessage('El nombre de la empresa es obligatorio.'),
  body('localName').trim().notEmpty().withMessage('El nombre de la sucursal es obligatorio.'),
  body('username').trim().notEmpty().withMessage('El usuario es obligatorio.'),
  body('email').isEmail().withMessage('El correo es invalido.'),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.'),
];
import { body, param } from 'express-validator';

export const catalogIdValidator = [param('id').isUUID().withMessage('Identificador invalido.')];
export const activeStateValidator = [
  body('isActive').isIn(['true', 'false']).withMessage('Estado de activación invalido.'),
];

export const categoryValidator = [
  body('localId').isUUID().withMessage('Sucursal invalida.'),
  body('name').trim().notEmpty().isLength({ max: 80 }).withMessage('El nombre es obligatorio (máximo 80 caracteres).'),
  body('description').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
];

export const productValidator = [
  body('localId').isUUID().withMessage('Sucursal invalida.'),
  body('categoryId').isUUID().withMessage('Categoría invalida.'),
  body('name').trim().notEmpty().isLength({ max: 120 }).withMessage('El nombre es obligatorio (máximo 120 caracteres).'),
  body('sku').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('description').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
  body('unit').trim().notEmpty().isLength({ max: 20 }).withMessage('La unidad es obligatoria.'),
  body('salePrice').isDecimal({ decimal_digits: '0,2' }).isFloat({ min: 0 }).withMessage('Precio invalido.').toFloat(),
  body('initialQuantity')
    .optional({ values: 'falsy' })
    .isDecimal({ decimal_digits: '0,3' })
    .isFloat({ min: 0 })
    .withMessage('El stock inicial no puede ser negativo.')
    .toFloat(),
  body('currentQuantity')
    .optional({ values: 'falsy' })
    .isDecimal({ decimal_digits: '0,3' })
    .isFloat({ min: 0 })
    .withMessage('El stock no puede ser negativo.')
    .toFloat(),
];

export const supplierValidator = [
  body('businessName').trim().notEmpty().isLength({ max: 150 }).withMessage('El nombre es obligatorio.'),
  body('taxId').optional({ values: 'falsy' }).trim().isLength({ max: 30 }),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Email invalido.'),
  body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 30 }),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
];

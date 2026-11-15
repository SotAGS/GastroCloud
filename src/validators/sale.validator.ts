import { body, param } from 'express-validator';

export const createSaleValidator = [
  body('details')
    .customSanitizer((value) =>
      Array.isArray(value) ? value.filter((detail) => detail && String(detail.productId ?? '').trim()) : value,
    )
    .isArray({ min: 1 })
    .withMessage('Debe incluir al menos un producto.'),
  body('details.*.productId').isUUID().withMessage('Producto invalido.'),
  body('details.*.quantity')
    .isDecimal({ decimal_digits: '0,3' })
    .withMessage('La cantidad debe admitir hasta tres decimales.')
    .isFloat({ gt: 0 })
    .withMessage('La cantidad debe ser mayor a cero.')
    .toFloat(),
];

export const saleIdValidator = [param('id').isUUID().withMessage('Id de venta invalido.')];

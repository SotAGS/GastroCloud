import { HttpError } from './http-error.util';

export function ensureSufficientSaleStock(availableQuantity: number, requestedQuantity: number): void {
  if (!Number.isFinite(availableQuantity) || availableQuantity <= 0) {
    throw new HttpError(409, 'El producto no tiene stock disponible para la venta.');
  }

  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0 || requestedQuantity > availableQuantity) {
    throw new HttpError(409, 'La cantidad solicitada supera el stock disponible.');
  }
}

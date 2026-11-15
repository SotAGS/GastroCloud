import { CreateSaleDetailDto } from '../interfaces/dto.interface';
import { HttpError } from './http-error.util';

interface CatalogProductPrice {
  id: string;
  salePrice: number | string;
}

export interface PricedSaleDetail extends CreateSaleDetailDto {
  unitPrice: number;
  lineTotal: number;
}

export function priceSaleDetails(
  details: CreateSaleDetailDto[],
  products: readonly CatalogProductPrice[],
): PricedSaleDetail[] {
  const prices = new Map(products.map((product) => [product.id, Number(product.salePrice)]));
  return details.map((detail) => {
    const unitPrice = prices.get(detail.productId);
    if (unitPrice === undefined || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new HttpError(409, 'El producto no tiene un precio de venta válido.');
    }
    return {
      ...detail,
      unitPrice,
      lineTotal: Number((detail.quantity * unitPrice).toFixed(2)),
    };
  });
}

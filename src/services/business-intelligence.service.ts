import { Product, Stock } from '../models';
import { AuthUser } from '../interfaces/auth-user.interface';
import { env } from '../config/env.config';
import { getTenantScope } from '../utils/tenant-scope.util';
import { Op } from 'sequelize';

interface BusinessSnapshot {
  companyId: string | null;
  localId: string | null;
  totalProducts: number;
  lowStockItems: Array<{ name: string; quantity: number; minimumQuantity: number }>;
  topProducts: Array<{ name: string; quantity: number }>;
  summary: string;
}

export class BusinessIntelligenceService {
  static async buildBusinessSnapshot(user?: AuthUser): Promise<BusinessSnapshot> {
    const scope = getTenantScope(user);
    const stocks = await Stock.findAll({
      where: scope.localId ? { localId: scope.localId } : { localId: { [Op.ne]: null } },
      include: [{
        association: 'product',
        where: { companyId: scope.companyId, ...(scope.localId ? { localId: scope.localId } : {}) },
        required: true,
      }],
      order: [['updatedAt', 'DESC']],
    });

    const productRows = stocks
      .map((stock) => {
        const product = stock.product as Product | undefined;
        if (!product) return null;
        return {
          name: product.name,
          quantity: Number(stock.currentQuantity ?? 0),
          minimumQuantity: Number(stock.minimumQuantity ?? 0),
        };
      })
      .filter((item): item is { name: string; quantity: number; minimumQuantity: number } => !!item);

    const lowStockItems = productRows
      .filter((item) => item.quantity <= item.minimumQuantity)
      .slice(0, 6);

    const topProducts = productRows
      .slice()
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
      .map((item) => ({ name: item.name, quantity: item.quantity }));

    return {
      companyId: user?.companyId ?? null,
      localId: user?.localId ?? null,
      totalProducts: productRows.length,
      lowStockItems,
      topProducts,
      summary:
        'Información de negocio disponible para el tenant activo; no se expone código fuente ni datos de otras empresas.',
    };
  }

  static async ask(user: AuthUser | undefined, question: string): Promise<string> {
    const snapshot = await this.buildBusinessSnapshot(user);
    const normalized = question.trim();

    if (!normalized) {
      return 'Necesito que me formulés una pregunta sobre tu negocio.';
    }

    const openAiKey = env.ai.openAiApiKey;
    if (openAiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: env.ai.openAiModel,
            temperature: 0.2,
            messages: [
              {
                role: 'system',
                content:
                  'Eres un asistente interno de negocio para GastroCloud. Responde solo con el contexto empresarial proporcionado. Nunca des información del código fuente, rutas, bases de datos, infraestructura ni de otras empresas. Si faltan datos, indica que no hay información suficiente.',
              },
              {
                role: 'user',
                content: `Contexto del negocio:\n${JSON.stringify(snapshot, null, 2)}\n\nPregunta: ${normalized}`,
              },
            ],
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as {
            choices?: Array<{
              message?: {
                content?: string;
              };
            }>;
          };
          const answer = data.choices?.[0]?.message?.content;
          if (answer && typeof answer === 'string' && answer.trim()) {
            return answer.trim();
          }
        }
      } catch (error) {
        console.warn('OpenAI no disponible para el asistente; usando respuesta local.', error);
      }
    }

    return this.fallbackAnswer(normalized, snapshot);
  }

  private static fallbackAnswer(question: string, snapshot: BusinessSnapshot): string {
    const lowStock = snapshot.lowStockItems.length;
    const products = snapshot.totalProducts;
    const bestProducts = snapshot.topProducts
      .map((item) => `${item.name} (${item.quantity} uds)`)
      .join(', ');

    const q = question.toLowerCase();

    if (q.includes('stock') || q.includes('inventario')) {
      if (lowStock === 0) {
        return `El negocio tiene ${products} productos cargados y no hay alertas de stock bajo en este momento. Los productos con más stock son: ${bestProducts || 'sin datos disponibles'}.`;
      }
      return `Hay ${lowStock} ítems con stock bajo o mínimo alcanzado. Los más relevantes son: ${snapshot.lowStockItems
        .map((item) => `${item.name} (${item.quantity}/${item.minimumQuantity})`)
        .join(', ')}. El negocio cuenta con ${products} productos en total.`;
    }

    if (q.includes('bajo') || q.includes('mínimo') || q.includes('alerta')) {
      return lowStock > 0
        ? `Los alertas actuales son: ${snapshot.lowStockItems
            .map((item) => `${item.name}: ${item.quantity} disponibles / mínimo ${item.minimumQuantity}`)
            .join('; ')}.`
        : 'No hay alertas de stock mínimo para los productos visibles en el contexto del negocio actual.';
    }

    if (q.includes('producto') || q.includes('top') || q.includes('más')) {
      return `Los productos con mayor cantidad disponible son: ${bestProducts || 'sin datos disponibles'}.`;
    }

    if (q.includes('empresa') || q.includes('negocio')) {
      return `El asistente está limitado al contexto del negocio actual. El tenant activo tiene companyId ${snapshot.companyId ?? 'sin empresa'} y localId ${snapshot.localId ?? 'sin local'}. No puede consultar información de otras empresas ni del código fuente de GastroCloud.`;
    }

    return `He revisado el contexto disponible del negocio actual. Hay ${products} productos cargados, ${lowStock} alertas de stock y los productos más relevantes son: ${bestProducts || 'sin datos disponibles'}. Si quieres, puedo ayudarte a revisar stock, alertas o productos prioritarios.`;
  }
}

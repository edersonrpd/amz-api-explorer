import { useState } from "react";
import { AmazonListing } from "../types";
import { exportListingToExcel } from "../lib/export";

interface ListingResultProps {
  data: AmazonListing;
  onToast: (msg: string) => void;
}

// Posiciona o preço atual proporcionalmente dentro da faixa [mín, máx].
// Retorna 0–100, com proteção contra divisão por zero (máx <= mín).
function pricePosition(price: number, min: number, max: number): number {
  if (max <= min) return 100;
  const pct = ((price - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function ListingResult({ data, onToast }: ListingResultProps) {
  const [descOpen, setDescOpen] = useState(false);
  
  const summary = data.summaries?.[0] || {} as any;
  const attributes = data.attributes || {};
  const issues = data.issues || [];
  const qty = data.fulfillmentAvailability?.[0]?.quantity ?? 0;
  
  const imgUrl = summary.mainImage?.link || "https://m.media-amazon.com/images/I/31W9mI3+p3L.jpg";
  const title = summary.itemName || attributes.item_name?.[0]?.value || "Nome não disponível";
  const pType = summary.productType || attributes.product_type?.[0]?.value || "Não definido";
  const asin = summary.asin || attributes.merchant_suggested_asin?.[0]?.value || "";
  const statuses = summary.status || [];
  const ean = attributes.externally_assigned_product_identifier?.[0]?.value || "";
  
  const condition = summary.conditionType || attributes.condition_type?.[0]?.value || "new_new";
  const createdAt = summary.createdDate ? new Date(summary.createdDate).toLocaleDateString("pt-BR") : "N/A";
  const updatedAt = summary.lastUpdatedDate ? new Date(summary.lastUpdatedDate).toLocaleDateString("pt-BR") : "N/A";

  const priceAttr = attributes.purchasable_offer?.[0];
  const sellPrice = priceAttr?.our_price?.[0]?.schedule?.[0]?.value_with_tax || data.offers?.[0]?.price?.amount || 0;
  const sellPriceStr = sellPrice.toFixed(2).replace('.', ',');
  const discPrice = priceAttr?.discounted_price?.[0]?.schedule?.[0]?.value_with_tax;
  const minPrice = priceAttr?.minimum_seller_allowed_price?.[0]?.schedule?.[0]?.value_with_tax;
  const maxPrice = priceAttr?.maximum_seller_allowed_price?.[0]?.schedule?.[0]?.value_with_tax;

  const getAttrVal = (key: string) => {
    const val = attributes[key];
    if (!val) return null;
    if (Array.isArray(val)) {
      return val.map((v: any) => typeof v === 'object' ? v.value || JSON.stringify(v) : String(v)).join(", ");
    }
    if (typeof val === 'object' && val !== null) {
      return val.value || JSON.stringify(val);
    }
    return String(val);
  };

  const getAttrValList = (key: string) => {
    const val = attributes[key];
    if (!val) return [];
    if (Array.isArray(val)) {
      return val.map((v: any) => typeof v === 'object' ? v.value || JSON.stringify(v) : String(v));
    }
    return [String(val)];
  };
  
  const brand = getAttrVal('brand');
  const country = getAttrVal('country_of_origin');

  const bulletsRaw = getAttrValList('bullet_point');
  const bullets = bulletsRaw.length ? bulletsRaw : getAttrValList('bullet_points');
  const description = getAttrVal('product_description') || getAttrVal('description') || "As informações completas da descrição e conteúdo constam no JSON caso não retornem diretamente em summaries.\n\n(A visualização do HTML para a descrição está pronta para receber a injeção do texto proveniente dos dados estritos do Amazon Catalog.)";

  // helper pra extrair partes inteiras e fracionárias
  const formatPriceParts = (val: number) => {
    const s = val.toFixed(2);
    const [intP, decP] = s.split('.');
    return { intP, decP };
  };

  const { intP: mainInt, decP: mainDec } = formatPriceParts(sellPrice || 0);

  // Calcula a posição do slider min/max.
  // A API às vezes retorna os valores como string, então fazemos parse numérico
  // explícito antes de normalizar (evita comparação/concatenação lexicográfica).
  const toNum = (v: any): number | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = parseFloat(v);
    return isNaN(n) ? undefined : n;
  };
  const minNum = toNum(minPrice);
  const maxNum = toNum(maxPrice);
  const priceNum = toNum(sellPrice);

  let sliderPerc = 50;
  if (minNum !== undefined && maxNum !== undefined) {
    // Sem preço atual, posiciona no mínimo da faixa.
    sliderPerc = pricePosition(priceNum ?? minNum, minNum, maxNum);
  }

  const handleCopy = (text: string) => {
    if(navigator.clipboard) {
      navigator.clipboard.writeText(text);
      onToast('ASIN copiado!');
    }
  };

  return (
    <div className="grid-layout">
      {/* LEFT */}
      <div className="stack">
        {/* Product hero */}
        <section className="card">
          <div className="hero">
            <div className="hero-img">
              {imgUrl ? (
                <img src={imgUrl} alt="Produto" />
              ) : (
                <div className="ph">foto do<br/>produto</div>
              )}
            </div>
            <div className="hero-body">
              <span className="ptype">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                {pType}
              </span>
              <h2 className="hero-title">{title}</h2>
              <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
                {asin && (
                  <span className="asin-chip">
                    <span className="k">ASIN</span>
                    <span className="v">{asin}</span>
                    <button className="copy-btn" onClick={() => handleCopy(asin)} title="Copiar ASIN">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                  </span>
                )}
              </div>
              <div className="badges">
                {statuses.map((st: string) => (
                  <span key={st} className={`badge ${st === 'BUYABLE' || st === 'DISCOVERABLE' ? 'green' : 'blue'}`}>{st}</span>
                ))}
                {ean && <span className="badge blue">EAN {ean}</span>}
              </div>
              <div className="meta-grid">
                <div className="meta"><div className="mk">Condição</div><div className="mv cond">{condition}</div></div>
                <div className="meta"><div className="mk">Data de criação</div><div className="mv">{createdAt}</div></div>
                <div className="meta"><div className="mk">Última atualização</div><div className="mv">{updatedAt}</div></div>
              </div>
            </div>
          </div>
        </section>

        {/* Price panel */}
        <section className="price-card">
          <div className="price-head">
            <span className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span>
            <h2>Preço &amp; Oferta</h2>
            <span className="cur">{priceAttr?.currency || data.offers?.[0]?.price?.currencyCode || 'BRL'} · ALL</span>
          </div>
          <div className="price-body">
            <div className="price-main">
              <div className="pk">Preço de venda</div>
              <div className="pv"><small>R$</small>{mainInt},{mainDec}</div>
            </div>
            <div className="price-sep"></div>
            <div className="price-secondary">
              {discPrice != null && (
                <div className="psec">
                  <div className="pk">Preço com desconto</div>
                  <div className="pv disc">R$ {discPrice.toFixed(2).replace('.',',')}</div>
                </div>
              )}
              <div className="psec">
                <div className="pk">Mín. permitido</div>
                <div className="pv">{minPrice != null ? `R$ ${minPrice.toFixed(2).replace('.',',')}` : 'N/D'}</div>
              </div>
              <div className="psec">
                <div className="pk">Máx. permitido</div>
                <div className="pv">{maxPrice != null ? `R$ ${maxPrice.toFixed(2).replace('.',',')}` : 'N/D'}</div>
              </div>
            </div>
          </div>
          {(minPrice != null || maxPrice != null) && (
            <div className="price-range">
              <span className="range-cap">Mín<b>R$ {minPrice?.toFixed(2).replace('.',',') || 'N/D'}</b></span>
              <div className="range-track">
                <div className="range-fill" style={{left: 0, width: `${sliderPerc}%`}}></div>
                <div className="range-dot" style={{left: `${sliderPerc}%`}}></div>
              </div>
              <span className="range-cap" style={{textAlign: 'right'}}>Máx<b>R$ {maxPrice?.toFixed(2).replace('.',',') || 'N/D'}</b></span>
            </div>
          )}
        </section>

        {/* Attribute theme cards */}
        <div className="attr-grid">
          {/* Identificação */}
          <section className="card">
            <div className="card-head">
              <span className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5"/><path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2"/><circle cx="9" cy="10" r="2"/><path d="M15 8h3"/><path d="M15 12h3"/><path d="M7 16h10"/></svg></span>
              <h2>Identificação</h2>
            </div>
            <div className="attr-list">
              <div className="attr-row"><span className="akey">Marca</span><span className="aval">{brand || 'N/A'}</span></div>
              <div className="attr-row"><span className="akey">EAN</span><span className="aval mono">{ean || 'N/A'}</span></div>
              <div className="attr-row"><span className="akey">ASIN sugerido</span><span className="aval mono">{asin || 'N/A'}</span></div>
              <div className="attr-row"><span className="akey">Tipo de produto</span><span className="aval"><span className="pill neutral">{pType}</span></span></div>
              <div className="attr-row"><span className="akey">Condição</span><span className="aval"><span className="pill neutral">{condition}</span></span></div>
            </div>
          </section>

          {/* Logística & Fiscal */}
          <section className="card">
            <div className="card-head">
              <span className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg></span>
              <h2>Logística &amp; Fiscal</h2>
            </div>
            <div className="attr-list">
              <div className="attr-row"><span className="akey">País de origem</span><span className="aval">{country || 'N/A'}</span></div>
              <div className="attr-row"><span className="akey">Designação imp.</span><span className="aval">Nacional (0)</span></div>
              {/* Fake defaults for UI sake like in the html */}
              <div className="attr-row"><span className="akey">Grupo de envio</span><span className="aval mono">legacy-template-id</span></div>
              <div className="attr-row"><span className="akey">Regulação DG/HZ</span><span className="aval"><span className="pill neutral">not_applicable</span></span></div>
              <div className="attr-row"><span className="akey">Pular oferta</span><span className="aval"><span className="pill on">Sim</span></span></div>
            </div>
          </section>

          {/* Conteúdo & SEO */}
          <section className="card full">
            <div className="card-head">
              <span className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/><path d="M12 4v16"/></svg></span>
              <h2>Conteúdo &amp; SEO</h2>
            </div>
            <div className="attr-list">
              <div className="attr-row"><span className="akey">Nome completo</span><span className="aval">{title}</span></div>
              <div className="attr-row" style={{flexDirection:'column',alignItems:'stretch',gap:'8px'}}>
                <span className="akey">Descrição</span>
                <div className="aval" style={{flex:'none', position: 'relative'}}>
                  <div className={`desc ${descOpen ? 'open' : ''}`}>
                    {bullets.length > 0 && (
                      <ul style={{listStyleType: 'disc', paddingLeft: '16px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px'}}>
                        {bullets.map((b, idx) => (
                          <li key={idx}>{b}</li>
                        ))}
                      </ul>
                    )}
                    <div dangerouslySetInnerHTML={{ __html: description }} />
                  </div>
                  <div className="desc-fade"></div>
                  <button className="more-btn" onClick={() => setDescOpen(!descOpen)}>
                    {descOpen ? 'Recolher descrição ' : 'Ver descrição completa '}
                    <svg style={{transform: descOpen ? 'rotate(180deg)' : ''}} viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                </div>
              </div>
              <div className="attr-row" style={{flexDirection:'column',alignItems:'stretch',gap:'10px'}}>
                <span className="akey">Mídia principal</span>
                {imgUrl ? (
                  <div className="media-row">
                    <div className="media-thumb"><img src={imgUrl} alt="" /></div>
                    <a className="media-link" href={imgUrl} target="_blank" rel="noopener noreferrer">{imgUrl}</a>
                  </div>
                ) : (
                  <span className="aval mono text-gray-500">N/A</span>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* RIGHT sidebar */}
      <div className="stack side">
        {/* Issues */}
        <section className="card">
          <div className="card-head">
            <span className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10Z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg></span>
            <h2>Problemas</h2>
            <span className="count">{issues.length}</span>
          </div>
          {issues.length === 0 ? (
            <div className="ok-state">
              <div className="ok-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
              <p>Nenhum problema encontrado</p>
              <div className="s">O anúncio está íntegro</div>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {issues.map((i, idx) => (
                <div key={idx} className="p-3 bg-red-50/50 border border-red-100 rounded-lg text-sm">
                  <div className="font-bold text-red-900 mb-1">{i.code} <span className="opacity-70 font-mono text-xs ml-2">{i.severity}</span></div>
                  <div className="text-red-700 leading-snug">{i.message}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Estoque & Ofertas */}
        <section className="card">
          <div className="card-head">
            <span className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></span>
            <h2>Estoque &amp; Ofertas</h2>
          </div>
          <div className="side-block">
            <div className="side-label">Fulfillment</div>
            <div className="line">
              <div className="ln-l"><span className="ln-k">DEFAULT</span><span className="ln-s">Lead time: 0 dias</span></div>
              <span className="ln-v">{qty} <span style={{color:'var(--muted)',fontWeight:600,fontSize:'11px'}}>unid.</span></span>
            </div>
          </div>
          <div className="side-block">
            <div className="side-label">Ofertas</div>
            <div className="line">
              <div className="ln-l"><span className="ln-k">B2C</span><span className="ln-s">Vender na Amazon</span></div>
              <span className="ln-v amount">R$ {sellPriceStr}</span>
            </div>
          </div>
        </section>

        {/* Relacionamentos */}
        <section className="card">
          <div className="card-head">
            <span className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg></span>
            <h2>Relacionamentos</h2>
          </div>
          <div className="side-block">
             {data.relationships && data.relationships.length > 0 ? (
               <p className="text-[13px] font-medium">{data.relationships.length} relacionamentos.</p>
             ) : (
               <p className="empty-note">Sem relacionamentos (parent/child).</p>
             )}
          </div>
        </section>
      </div>
    </div>
  );
}

import { getLang } from './i18n.js';

const units = {
  item: ['حبة', 'حبتان', 'حبات', 'للحبة', 'item', 'items'],
  chicken: ['دجاجة', 'دجاجتان', 'دجاجات', 'للدجاجة', 'chicken', 'chickens'],
  group: ['مجموعة', 'مجموعتان', 'مجموعات', 'للمجموعة', 'group', 'groups'],
  bottle: ['قارورة', 'قارورتان', 'قوارير', 'للقارورة', 'bottle', 'bottles'],
  can: ['علبة', 'علبتان', 'علب', 'للعلبة', 'can', 'cans'],
  box: ['علبة', 'علبتان', 'علب', 'للعلبة', 'box', 'boxes'],
  jar: ['برطمان', 'برطمانان', 'برطمانات', 'للبرطمان', 'jar', 'jars'],
  bag: ['كيس', 'كيسان', 'أكياس', 'للكيس', 'bag', 'bags'],
  pack: ['عبوة', 'عبوتان', 'عبوات', 'للعبوة', 'pack', 'packs'],
  cup: ['كوب', 'كوبان', 'أكواب', 'للكوب', 'cup', 'cups'],
  sachet: ['ظرف', 'ظرفان', 'أظرف', 'للظرف', 'sachet', 'sachets'],
  roll: ['لفة', 'لفتان', 'لفات', 'للفة', 'roll', 'rolls'],
  tube: ['أنبوب', 'أنبوبان', 'أنابيب', 'للأنبوب', 'tube', 'tubes'],
  set: ['طقم', 'طقمان', 'أطقم', 'للطقم', 'set', 'sets'],
};
export function salePresentation(sale, price, lang = getLang()) {
  if (!(sale?.count > 1)) return [];
  const count = sale.count, u = units[sale.unitKind] || units.item;
  const size = (lang==='ar'?sale.packageSizeAr:sale.packageSizeEn)?.trim() || sale.packageSize?.trim();
  if (lang === 'ar') {
    const quantity = count === 2 ? u[1] : `${count} ${count <= 10 ? u[2] : u[0]}`;
    return [`العرض: ${quantity}${size ? ` · ${size} ${u[3]}` : ''}`, `${price} ${u[3]} ضمن العرض`];
  }
  return [`Offer: ${count} ${u[5]}${size ? ` · ${size} per ${u[4]}` : ''}`, `${price} per ${u[4]} within the offer`];
}

export function offerSizeLabel(offer,lang=getLang()) {
  if (!offer?.sizeReading && !offer?.sizeDisplayAr && !offer?.sizeDisplayEn && offer?.priceBasis && ['kg','l'].includes(offer.priceBasis.unit)
    && !/[\d٠-٩۰-۹]/u.test(offer.size || '')) return lang==='ar'
      ? (offer.priceBasis.unit==='kg'?'يباع بالكيلو':'يباع باللتر') : `Sold per ${offer.priceBasis.unit}`;
  const label=(lang==='ar'?offer?.sizeDisplayAr:offer?.sizeDisplayEn) || offer?.size || '';
  if (!label) return '';
  if (!offer.assortedSizes) return label;
  if (offer.priceBasis && ['kg','l'].includes(offer.priceBasis.unit)) {
    return lang==='ar'?`أحجام متعددة: ${label} · السعر لل${offer.priceBasis.unit==='kg'?'كيلو':'تر'}`:`Assorted sizes: ${label} · price per ${offer.priceBasis.unit}`;
  }
  return lang==='ar'?`منوع بأحجام متعددة وبسعر واحد: ${label}`:`Assorted sizes, same price: ${label}`;
}

export function sizeOptionsPresentation(options,price,lang=getLang()) {
  if (!options?.length) return [];
  const unitLabel=unit=>lang==='ar'?({kg:'كجم',l:'لتر',piece:'حبة'}[unit]||unit):unit;
  if (options.every(o=>o.range && o.unitPrice.unit===options[0].unitPrice.unit)) {
    const values=options.map(o=>o.unitPrice.value);
    return [`${lang==='ar'?'نطاق سعر الوحدة':'Unit price range'}: ${price(Math.min(...values))} – ${price(Math.max(...values))} / ${unitLabel(options[0].unitPrice.unit)}`];
  }
  const heading=options.some(o=>o.saleCount>1)
    ? (lang==='ar'?'سعر الوحدة عند اختيار حبات بالحجم نفسه:':'Unit price when all items have the same size:')
    : (lang==='ar'?'سعر الوحدة حسب الحجم:':'Unit price by size:');
  return [heading,...options.map(option=>{
    const label=lang==='ar'?option.displayAr:option.displayEn;
    return `${label}: ${price(option.unitPrice.value)} / ${unitLabel(option.unitPrice.unit)}`;
  })];
}

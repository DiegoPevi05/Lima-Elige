// Lee ../candidatos_lima_2026.txt (respuestas del JNE, una por línea), se queda
// con las candidaturas que aparecen en la encuesta y genera src/data/candidatos.json.
// También descarga la foto oficial de cada hoja de vida a public/img/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.resolve(root, '..', 'candidatos_lima_2026.txt');
const FOTO_URL = (guid) => `https://mpesije.jne.gob.pe/apidocs/${guid}.jpg`;

// Encuesta de intención de voto (Ipsos, setiembre 2026). Tienen sección propia
// las candidaturas hasta Susel Paredes; el resto se agrupa en `otros`.
const ENCUESTA = {
  fuente: 'Ipsos',
  fecha: 'setiembre de 2026',
  filas: [
    { org: 'RENOVACION POPULAR PERU', slug: 'renovacion-popular', partido: 'Renovación Popular', color: '#1789c4', v: 25 },
    { org: 'PARTIDO DEMOCRATICO SOMOS PERU', slug: 'somos-peru', partido: 'Somos Perú', color: '#d7263d', v: 14 },
    { org: 'AVANZA PAIS - PARTIDO DE INTEGRACION SOCIAL', slug: 'avanza-pais', partido: 'Avanza País', color: '#d4127a', v: 13 },
    { org: 'PODEMOS PERU', slug: 'podemos-peru', partido: 'Podemos Perú', color: '#3a2f9b', v: 8 },
    { org: 'FUERZA POPULAR', slug: 'fuerza-popular', partido: 'Fuerza Popular', color: '#e8701a', v: 6 },
    { org: 'AHORA NACION - AN', slug: 'ahora-nacion', partido: 'Ahora Nación', color: '#0f8a6a', v: 3 },
  ],
  otros: [
    { nombre: 'Ricardo Belmont', partido: 'Partido Cívico Obras', v: 3 },
    { nombre: 'Elio Riera', partido: 'Alianza para el Progreso', v: 2 },
    { nombre: 'Oswaldo Vargas', partido: 'Juntos por el Perú', v: 2 },
    { nombre: 'Alberto Tejada', partido: 'Acción Popular', v: 2 },
    { nombre: 'Otras candidaturas', partido: '', v: 8 },
  ],
  blancoViciado: 5,
  noPrecisa: 9,
};

// ---------- lectura tolerante ----------
// El archivo trae un registro pegado dentro de otro; se recorre el texto
// buscando cada inicio de respuesta y se rearman los que quedaron partidos.
function parseRecords(text) {
  const START = '{"success":true';
  const flat = text.replace(/\r?\n/g, '');
  const chunks = flat.split(START).filter(Boolean).map((c) => START + c);
  const out = [];
  let pending = null;
  for (const chunk of chunks) {
    try {
      out.push(JSON.parse(chunk).data);
      continue;
    } catch {}
    // Registro interrumpido: busca dónde termina el intruso y une el resto.
    if (pending === null) {
      pending = chunk;
      continue;
    }
    let fixed = false;
    for (let i = chunk.indexOf('}}'); i !== -1; i = chunk.indexOf('}}', i + 1)) {
      try {
        const intruso = JSON.parse(chunk.slice(0, i + 2)).data;
        const resto = JSON.parse(pending + chunk.slice(i + 2)).data;
        out.push(resto, intruso);
        fixed = true;
        break;
      } catch {}
    }
    if (!fixed) console.warn('No se pudo reparar un registro');
    pending = null;
  }
  return out;
}

// ---------- formato ----------
const SIGLAS = new Set(['SAC', 'S.A.C', 'S.A.C.', 'S.A.', 'SA', 'S.A', 'PPC', 'FAG', 'OGAME', 'BCP', 'AI', 'II', 'III', 'JNE', 'SUNEDU', 'SUNARP', 'EIRL']);
const MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'para', 'por', 'con', 'a', 'al']);
const clean = (s) => (s ?? '').toString().replace(/\s+/g, ' ').trim();

function titulo(s) {
  s = clean(s);
  if (!s) return '';
  return s
    .split(' ')
    .map((w, i) => {
      if (SIGLAS.has(w.toUpperCase())) return w.toUpperCase();
      const low = w.toLocaleLowerCase('es');
      if (i > 0 && MENORES.has(low)) return low;
      return low.replace(/(^|[-(/"“])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('es'));
    })
    .join(' ');
}

// Textos libres: solo se normalizan si vienen íntegramente en mayúsculas.
function frase(s) {
  s = clean(s);
  if (!s) return '';
  if (s !== s.toLocaleUpperCase('es')) return s;
  const low = s.toLocaleLowerCase('es');
  return low.replace(/(^|[.:]\s+)(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('es')).replace(/\bn° ?/g, 'N.° ').replace(/\bs\/ ?/g, 'S/ ');
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const anios = (a, b) => {
  a = clean(a);
  b = clean(b);
  if (/actualidad/i.test(b)) b = 'hoy';
  if (!a) return b;
  return !b || a === b ? a : `${a}–${b}`;
};

function edad(fecha, hoy = new Date()) {
  const [d, m, y] = fecha.split('/').map(Number);
  let e = hoy.getFullYear() - y;
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) e--;
  return e;
}

function transformar(d, fila, puesto) {
  const g = d.datoGeneral;
  const f = d.formacionAcademica;
  const t = d.trayectoria;
  const dj = d.declaracionJurada;
  const ing = dj.ingreso?.[0];
  const publico = ing ? num(ing.remuBrutaPublico) + num(ing.rentaIndividualPublico) + num(ing.otroIngresoPublico) : 0;
  const privado = ing ? num(ing.remuBrutaPrivado) + num(ing.rentaIndividualPrivado) + num(ing.otroIngresoPrivado) : 0;

  const inmuebles = dj.bienInmueble.map((b) => ({ tipo: titulo(b.tipoBienInmueble), valor: num(b.flValor) || num(b.autovaluo), nota: frase(b.comentario) }));
  const muebles = dj.bienMueble.map((b) => ({ tipo: titulo(b.caracteristica || b.vehiculo), valor: num(b.valor), nota: frase(b.comentario) }));
  const empresas = dj.titularidad.map((x) => ({ nombre: titulo(x.txPersonaJuridica), tipo: titulo(x.txTipoTitularidad), valor: num(x.flValor) }));

  const formacion = [
    ...f.educacionPosgrado.map((p) => ({
      nivel: p.esDoctor === 'SI' ? 'Doctorado' : p.esMaestro === 'SI' ? 'Maestría' : 'Posgrado',
      titulo: titulo(p.txEspecialidadPosgrado),
      centro: titulo(p.txCenEstudioPosgrado),
      anio: clean(p.txAnioPosgrado),
      nota: frase(p.txComentario),
    })),
    ...f.educacionPosgradoOtro.map((p) => ({
      nivel: 'Otro posgrado',
      titulo: titulo(p.txEspecialidadPosgradoOtro),
      centro: titulo(p.txCenEstudioPosgradoOtro),
      anio: /^\d{4}$/.test(clean(p.txAnioPosgradoOtro)) ? clean(p.txAnioPosgradoOtro) : '',
      nota: frase(p.txComentario),
    })),
    ...f.educacionUniversitaria
      .slice()
      .sort((a, b) => num(b.anioBachiller) - num(a.anioBachiller))
      .map((u) => ({ nivel: 'Universitaria', titulo: titulo(u.carreraUni), centro: titulo(u.universidad), anio: clean(u.anioBachiller), nota: '' })),
    ...f.educacionTecnico.map((u) => ({ nivel: 'Técnica', titulo: titulo(u.carreraTecnico), centro: titulo(u.centroEstudio), anio: '', nota: '' })),
  ];

  // El JNE publica nombres de menores en algunos fallos; aquí se omiten.
  const sinMenores = (s) => s.replace(/(menor hijo)\s+[\p{L} ]+?\s+(con una)/iu, '$1 $2');

  return {
    slug: fila.slug,
    puesto,
    partido: fila.partido,
    organizacion: titulo(g.organizacionPolitica),
    color: fila.color,
    intencion: fila.v,
    nombre: titulo(`${g.nombres} ${g.apellidoPaterno} ${g.apellidoMaterno}`),
    nombreCorto: titulo(`${g.nombres.split(' ')[0]} ${g.apellidoPaterno}`),
    apellido: titulo(g.apellidoPaterno),
    cargo: titulo(g.cargo),
    numeroLista: g.numeroCandidato || null,
    estado: titulo(g.estado),
    edad: edad(g.feNacimiento),
    nacimiento: g.feNacimiento,
    lugar: titulo([g.naciDistrito, g.naciDepartamento].filter(Boolean).join(', ')),
    foto: `img/${fila.slug}.jpg`,
    experiencia: d.experienciaLaboral
      .slice()
      .sort((a, b) => num(b.anioTrabajoHasta) - num(a.anioTrabajoHasta) || num(b.anioTrabajoDesde) - num(a.anioTrabajoDesde))
      .map((e) => ({ anios: anios(e.anioTrabajoDesde, e.anioTrabajoHasta), cargo: titulo(e.ocupacionProfesion), lugar: titulo(e.centroTrabajo), nota: frase(e.txComentario) })),
    formacion,
    cargosEleccion: t.cargoEleccion
      .slice()
      .sort((a, b) => num(b.anioCargoElecDesde) - num(a.anioCargoElecDesde))
      .map((c) => ({ anios: anios(c.anioCargoElecDesde, c.anioCargoElecHasta), cargo: titulo(c.cargoEleccion), org: titulo(c.orgPolCargoElec), nota: frase(c.txComentario) })),
    cargosPartido: t.cargoPartidario.map((c) => ({ anios: anios(c.anioCargoPartiDesde, c.anioCargoPartiHasta), cargo: titulo(c.cargoPartidario), org: titulo(c.orgPolCargoPartidario).replace(/^Partido Político /, '') })),
    renuncias: d.renunciaEfectuada
      .slice()
      .sort((a, b) => num(b.anioRenunciaOp) - num(a.anioRenunciaOp))
      .map((r) => ({ anio: clean(r.anioRenunciaOp), org: titulo(r.orgPolRenunciaOp) })),
    ingresos: { anio: ing?.anioIngresos ?? '', publico, privado, total: publico + privado },
    inmuebles,
    muebles,
    empresas,
    patrimonio: {
      inmuebles: inmuebles.reduce((s, b) => s + b.valor, 0),
      muebles: muebles.reduce((s, b) => s + b.valor, 0),
      empresas: empresas.reduce((s, b) => s + b.valor, 0),
    },
    sentenciasPenales: d.sentenciaPenal.map((s) => ({
      materia: titulo(s.materia),
      fuero: titulo(s.fuero),
      fecha: clean(s.fecSentencia),
      fallo: frase(s.fallo),
      estado: [s.modalidad, s.cumplimientoPena].filter(Boolean).map(titulo).join(' · '),
      nota: frase(s.txComentario),
    })),
    sentenciasObligaciones: d.sentenciaObliga.map((s) => ({
      materia: titulo(s.materia),
      fuero: titulo(s.fuero),
      fallo: sinMenores(frase(s.fallo)),
      nota: frase(s.txComentario),
    })),
    adicional: d.informacionAdicional.map((i) => frase(i.infoAdicional)).filter(Boolean),
  };
}

const records = parseRecords(await fs.readFile(SOURCE, 'utf8'));
console.log(`${records.length} hojas de vida leídas`);

await fs.mkdir(path.join(root, 'public/img'), { recursive: true });
await fs.mkdir(path.join(root, 'src/data'), { recursive: true });

const candidatos = [];
for (const [i, fila] of ENCUESTA.filas.entries()) {
  const d = records.find((r) => r.datoGeneral.organizacionPolitica === fila.org);
  if (!d) throw new Error(`Sin hoja de vida para ${fila.org}`);
  const c = transformar(d, fila, i + 1);
  candidatos.push(c);

  const dest = path.join(root, 'public', c.foto);
  const existe = await fs.stat(dest).then(() => true, () => false);
  if (!existe) {
    const res = await fetch(FOTO_URL(d.datoGeneral.txGuidFoto), { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) throw new Error(`Foto no disponible: ${c.nombre}`);
    await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  }
  console.log(`${c.puesto}. ${c.nombre} — ${c.partido} (${c.cargo})`);
}

await fs.writeFile(
  path.join(root, 'src/data/candidatos.json'),
  JSON.stringify({ encuesta: { fuente: ENCUESTA.fuente, fecha: ENCUESTA.fecha, otros: ENCUESTA.otros, blancoViciado: ENCUESTA.blancoViciado, noPrecisa: ENCUESTA.noPrecisa }, candidatos }, null, 2),
);

// ════════ Doodle Jump — MOTEUR (constantes D_*, génération, dessin canvas) ════════
// ⚠ Fichier chargé À LA DEMANDE par `loadDoodle()` (index.html, juste avant `GameDoodle`), en
// dehors du bloc compilé par Babel : ~7 000 lignes de JavaScript pur, sans le moindre JSX —
// il n'a donc rien à faire dans la compilation ni dans le cache de code, payés à chaque
// lancement du Hub même quand personne ne joue.
// ⚠ Script CLASSIQUE (pas un module) : ses `const`/`function` de premier niveau sont des
// globales lexicales, exactement comme celles du bloc principal — l'app les lit par leur nom.
// Conséquences : (1) aucun nom déclaré ici ne doit exister dans index.html (SyntaxError
// « already declared » au chargement) ; (2) index.html ne doit les lire QU'APRÈS le
// chargement, jamais au niveau module (ReferenceError) — `GameDoodle` s'en assure.
// Dépendances vers index.html (résolues à l'appel) : FLAGS, FLAG_PAL, FLAG_COLS_LO,
// FLAG_ROWS_LO (drapeaux du jeu Find Flag, réutilisés par la plateforme « drapeau »).
// Le drapeau `window.DOODLE_READY` en fin de fichier atteste un chargement COMPLET.
const DOODLE_W = 340, DOODLE_H = 480, D_CAM = DOODLE_H * 0.42;
// Jeu ralenti d'~20 % (demande utilisateur « trop rapide ») : vitesses ×0.8, gravité ×0.64
// → même hauteur de saut (v²/2g conservé), tout se déroule plus lentement.
const D_GRAV = 0.192, D_JUMP = -7.5, D_SPRING = -12.4, D_TRAMPO = -16.4, D_VMAX = 12;
// Gain de HAUTEUR par rebond consécutif sur la MÊME plateforme (8.0.3 : 3 % → 10 %,
// 8.0.6 : 10 % → 20 %, 8.1.3 : 20 % → 40 % par saut, demandes utilisateur). ⚠ C'est un gain
// de HAUTEUR, pas de vitesse : h ∝ v², donc la vitesse est multipliée par √1.40 (d'où
// l'exposant `streak / 2` au point d'usage — écrire `pow(1.40, streak)` donnerait +96 % de
// hauteur au 1er rebond au lieu des +40 % demandés).
const D_BOUNCE_BOOST = 1.40;
// ⚠ 9.1.3 — INVULNÉRABILITÉ DE 2 s APRÈS LA FIN D'UN BONUS DE VOL (demande utilisateur) :
// chapeau à hélice / jetpack. Pendant le vol on traverse déjà monstres et trous noirs ; le
// problème est l'instant PRÉCIS où le bonus s'arrête — on retombe à l'aveugle, souvent au
// milieu de monstres qui n'étaient pas évitables. Compté en FRAMES comme toutes les durées
// du jeu (`fly` = 190/119 frames), soit 2 s à 60 fps.
const D_INV = 120;
const D_PLAT_W = 62, D_PLAT_H = 14, D_FEET = 15, D_HALF = 15;
// Portée d'un saut normal ≈ D_JUMP²/(2·D_GRAV) ≈ 146 px. Écart entre plateformes :
// ≤ SAFE = confortable · entre SAFE et MAX = saut « limite » (dalle blanche + monstre latéral) · jamais > MAX (sinon saut infaisable).
const D_GAP_SAFE = 92, D_GAP_MAX = 120;
// ⚠ 9.3.3 — MONTÉE EN VITESSE DIVISÉE PAR DEUX (demande utilisateur) : la vitesse de base ne
// change pas, c'est le GAIN avec l'altitude (× `diff`, saturé à 700 points) qui est halvé —
// l'accélération se sentait trop brutalement. Dalles bleues : 0,56 → 1,12 au lieu de 1,68.
// Monstre d'escorte des sauts limites : 0,70 → 1,05 au lieu de 1,40.
// ⚠ 9.4.8 — la prise de vitesse des dalles bleues remonte de 10 % (demande utilisateur) :
// 0,56 → 0,616. C'est bien le GAIN avec l'altitude, pas la vitesse de base.
const D_BLUE_V = 0.56, D_BLUE_RAMP = 0.616;
const D_MOB_V = 0.7, D_MOB_RAMP = 0.35;
// ⚠ 9.4.8 — DENSITÉ (demande utilisateur) : blanche +5 %, bleue +10 %, multicolore +3 %,
// et « surtout au début » → le bonus est DOUBLÉ avant D_EARLY_SCORE points.
// ⚠ La blanche valait exactement ZÉRO au score 0 (sa part est un pur multiple de `diff`,
// qui part de 0) : un +5 % de zéro serait resté zéro, c'est-à-dire aucun effet précisément
// là où il est demandé. D'où D_WHITE_BASE, le plancher qui la fait exister avant 500 points.
const D_MORE_WHITE = 0.05, D_MORE_BLUE = 0.10, D_MORE_RAINBOW = 0.03;
const D_EARLY_SCORE = 500, D_EARLY_MUL = 2;
const D_WHITE_BASE = 0.02;
// Bandes de tirage des plateformes ordinaires, en [base, gain avec l'altitude].
const D_P_BREAK = [0.06, 0.10], D_P_BLUE = [0.10, 0.12], D_P_WHITE = [D_WHITE_BASE, 0.10];
// ⚠ 9.4.8 — MONSTRES (demande utilisateur) : +25 % entre 200 et 1000 points, +10 % au-delà.
// Avant 200 points on ne touche à rien : c'est la zone d'apprentissage de la partie.
const D_MOB_MORE_FROM = 200, D_MOB_MORE_TO = 1000, D_MOB_MORE_LO = 1.25, D_MOB_MORE_HI = 1.10;
function doodleEarly(score) { return score < D_EARLY_SCORE ? D_EARLY_MUL : 1; }
function doodleMobMore(score) { return score >= D_MOB_MORE_TO ? D_MOB_MORE_HI : score >= D_MOB_MORE_FROM ? D_MOB_MORE_LO : 1; }
// ⚠ Bandes CALCULÉES en un seul endroit : la boucle de génération ET les règles affichées les
// lisent ici. Recopier les seuils à la main, c'est garantir que les règles finissent par mentir.
function doodleBands(score, calm) {
  const diff = Math.min(1, score / 700), e = doodleEarly(score);
  return { b: (D_P_BREAK[0] + diff * D_P_BREAK[1]) * calm,
           m: (D_P_BLUE[0] + diff * D_P_BLUE[1]) * calm * (1 + D_MORE_BLUE * e),
           v: (D_P_WHITE[0] + diff * D_P_WHITE[1]) * calm * (1 + D_MORE_WHITE * e) };
}
const D_GAP_GROW = 0.022, D_GAP_GROW_MAX = 30;   // voir le commentaire de la boucle de génération (9.4.2)
// ⚠ 9.4.2 — Le souffle du bouclier gagne 20 % de portée (demande utilisateur) : c'est la
// récompense de la retombée après un jetpack, le moment où l'on atterrit au milieu des monstres.
const D_BOOM_BONUS = 1.2;
// ⚠ 9.1.4 — TIR : 1 tap = 1 balle droite · 2 taps = 3 balles (1 haut + 2 en diagonale).
// Les diagonales gardent la MÊME vitesse que la balle droite (√(dx²+dy²) = D_BULLET_V),
// sinon elles porteraient moins loin et le double tap serait un mauvais échange.
const D_BULLET_V = 6.8, D_BULLET_DX = 3.4, D_BULLET_DY = 5.89, D_SHOT_GAP = 8, D_DTAP_MS = 320;
// ⚠ 9.2.6 — MUNITIONS (demande utilisateur) : 50 au départ, UNE PAR BALLE — donc 1 sur un tap
// simple et 3 sur le tir triple. À sec on ne tire plus : restent le saut sur la tête et
// l'esquive. Deux sources de recharge seulement : les coffres lâchés par les monstres tués (ce
// qui boucle l'économie du jeu — tirer coûte, tuer rapporte) et la 🔋 tuile Recharge.
const D_AMMO_START = 50, D_AMMO_PICK = 25;
// Coffre lâché par CHAQUE monstre tué. Il TOMBE jusqu'à se poser sur la première plateforme
// rencontrée : laissé en l'air au point de mort, il serait le plus souvent inatteignable.
const D_CHEST_W = 24, D_CHEST_H = 19, D_CHEST_G = 0.34, D_CHEST_VMAX = 6.5;
// ⚠ 9.2.9 — Butins des coffres (demande utilisateur) : l'ÉVENTAIL est le seul cumulable — il
// ajoute +1 balle par palier jusqu'à D_SPREAD_MAX, et TOUTES ces balles ne coûtent qu'UNE
// munition (on paie le TIR, pas les balles). Les autres améliorations sont uniques : une fois
// prises, elles sortent du tirage (`max: 1`) pour ne jamais retomber en double.
// ⚠ Les MUNITIONS restent volontairement répétables : la rendre unique condamnerait la partie
// à ~50 balles puis au corps-à-corps définitif dès que la 🔋 Recharge ne tombe plus.
const D_SPREAD_MAX = 7;
const D_SHTIME = 250;
const D_UNLOCK_INV = 180;          // 3 s à 60 fps : invulnérabilité + prêt des boucliers après une annonce de déblocage              // ⏳ portée du bouclier temporel, en POINTS d'altitude (pas en secondes)
// ⚠ 9.3.5 — POIDS DE TIRAGE (demande utilisateur) : les butins ne sortent plus à égalité. Plus
// un butin est fort, plus il est rare — boucliers et laser sont de 2 à 5 fois plus rares qu'une
// amélioration de tir ordinaire (poids moyen 4,5). Le laser, le plus puissant, est le plus rare.
// ✴️ Trois lames, un tour en D_SHURIKEN_T frames, à D_SHURIKEN_R du doodler. ⚠ Le rayon est
// tenu SOUS la portée d'un écrasement de tête : au-delà, elles auraient tué les monstres qu'on
// cherche à sauter, et supprimé tout le jeu de l'esquive.
const D_SHURIKEN_N = 3, D_SHURIKEN_R = 34, D_SHURIKEN_T = 68, D_SHURIKEN_HIT = 9;
// 🔎 10.1.0 — GROS CALIBRE (demande utilisateur) : « double la taille de mes projectiles (tous
// les types) ». Le facteur est ADDITIF sur la base — ×2 au 1er palier comme demandé, puis ×3,
// ×4… ⚠ Un doublement MULTIPLICATIF aurait donné ×32 au 5e palier : une balle de 128 px de
// rayon sur un plateau large de 340, c'est-à-dire un écran plein et plus aucun jeu de visée.
// ⚠ 10.5.3 — DEUX PALIERS DE PLUS (demande utilisateur) : 5 → 7, donc ×8 au dernier, soit une
// balle de 32 px de rayon. C'est le plafond de ce qui reste jouable sur 340 px de large — au
// palier suivant, la balle couvrirait un cinquième du plateau et viser n'aurait plus de sens.
// ⚠ Il agrandit le DESSIN ET la boîte de contact : n'agrandir que le dessin aurait fait un
// bonus purement décoratif, n'agrandir que la boîte un bonus invisible.
const D_BIG_MAX = 7;
// 🌌 10.5.6 — SURVIVANT DES TROUS NOIRS (demande utilisateur) : « on reste en vie, le bonus
// disparaît, et le trou noir absorbe les monstres visibles et donne leurs coffres au
// joueur ». C'est le seul butin qui RETOURNE un danger : le trou noir se gorge à la place
// du doodler. ⚠ Consommable, donc répétable comme les boucliers — mais plafonné, sinon il
// suffirait d'en accumuler pour que les trous noirs cessent d'exister.
// ⚠ Sa clé commence par `sh` comme les trois boucliers : c'est ce préfixe qui dit au HUD
// qu'une pastille de protection ne doit pas passer en « gelé » (le ❄️ Gel absolu ne
// désarme pas ce qui sauve la vie).
const D_VOID_MAX = 2;
function doodleBigMul(s) { return 1 + doodleWpnOf(s, 'big'); }
// ✴️ 12.1.4 — LES LAMES GROSSISSENT TROIS FOIS MOINS (demande utilisateur) : au plafond du
// 🔎 Gros calibre, leur boîte de contact faisait 72 px de côté — plus large qu'une dalle
// (62 px) et plus du double du rayon de leur orbite (34 px). Les trois lames se recouvraient
// donc en un disque plein autour du doodler : la garde automatique balayait tout, il n'y avait
// plus ni esquive ni visée. Les DEUX termes demandés sont divisés par trois, et il en faut bien
// deux : le gain par palier (+1 → +⅓) et le PLAFOND (×8 → ×8/3), qui seul borne le résultat
// (+⅓ sept fois donnerait ×3,33). Le plafond mord donc à partir du 5e palier : 9 px de côté au
// départ, 24 au maximum au lieu de 72.
// ⚠ Ne concerne QUE les shurikens : balles, laser et missiles gardent `doodleBigMul`.
const D_SHURIKEN_BIG_DIV = 3;
function doodleShurikenMul(s) { return Math.min(1 + doodleWpnOf(s, 'big') / D_SHURIKEN_BIG_DIV, (1 + D_BIG_MAX) / D_SHURIKEN_BIG_DIV); }
const D_LOOT = [
  { k:'ammo',   icon:'📦', label:'Munitions',  txt:'+' + D_AMMO_PICK + ' balles',                    max: Infinity, w: 10 },
  { k:'spread', icon:'🌟', label:'Éventail',   txt:'+1 balle par tir, toujours 1 munition',          max: D_SPREAD_MAX, w: 6 },
  { k:'rate',   icon:'⚡', label:'Cadence',    txt:'tir plus rapide',                                max: 1, w: 5 },
  { k:'pierce', icon:'🎯', label:'Perforant',  txt:'la balle traverse un monstre de plus',           max: 1, w: 4 },
  { k:'boom',   icon:'💥', label:'Explosives', txt:'les balles éclatent à l\'impact',                max: 1, w: 3 },
  { k:'laser',  icon:'🔆', label:'Laser',      txt:'le tir transperce tout sur son passage',         max: 1, w: 1.2 },
  // 🚀 9.7.8 — TIR SPÉCIAL TÉLÉGUIDÉ (demande utilisateur) : il ne remplace pas le tir, il
  // l'ACCOMPAGNE — un missile part avec la balle et va chercher le monstre le plus proche.
  // ⚠ Il a sa propre cadence (D_MISSILE_GAP), sinon une cadence améliorée en aurait rempli
  // l'écran et l'arme aurait tout balayé sans qu'on vise plus rien.
  { k:'missile', icon:'🚀', label:'Missile',   txt:'un missile téléguidé part avec tes tirs et explose sur sa cible — au 2e exemplaire, il part aussi TOUT SEUL tant qu\'une créature est à l\'écran', max: 2, w: 1.2 },
  // ⚠ 9.3.4 — TROIS BOUCLIERS (demande utilisateur), CUMULABLES : on peut porter les trois à la
  // fois et ils se relaient dans cet ordre — le temporel absorbe sans se consommer, puis le
  // bouclier à charges, puis la carapace des paliers. Le parachute ne sert QUE sur une chute.
  // ⚠ Ce sont des CONSOMMABLES, pas des améliorations : ils restent donc répétables (avec un
  // plafond de charges), là où Cadence, Perforant et Explosives sont uniques.
  // ✴️ 9.8.4 — SHURIKENS (demande utilisateur) : trois lames qui tournent autour du doodler.
  // La première qui touche un monstre le tue NET — quelle que soit la bestiole, très rare
  // comprise — et se brise sur le coup. C'est une garde automatique à trois usages, pas une arme.
  // ⚠ Répétable comme les munitions (`max: Infinity`) : c'est un consommable, le rendre unique
  // en aurait fait un butin mort dès la première prise.
  { k:'shuriken', icon:'✴️', label:'Shurikens', txt: D_SHURIKEN_N + ' lames tournent autour de toi et tuent net le monstre qu\'elles touchent', max: Infinity, w: 2 },
  { k:'big',    icon:'🔎', label:'Gros calibre', txt:'tous tes projectiles doublent de taille',  max: D_BIG_MAX, w: 4 },
  { k:'shTime', icon:'⏳', label:'Bouclier temporel', txt:'invulnérable pendant ' + D_SHTIME + ' points', max: 3, w: 1.5 },
  { k:'shHit',  icon:'🛡️', label:'Bouclier',          txt:'encaisse un coup',                     max: 3, w: 2 },
  { k:'shFall', icon:'🪂', label:'Parachute',         txt:'rattrape une chute dans le vide',      max: 2, w: 1.5 },
  { k:'shVoid', icon:'🌌', label:'Survivant des trous noirs', txt:'tu survis au trou noir qui devait t\'avaler : il engloutit à ta place toutes les créatures visibles et t\'offre le butin de leurs coffres', max: D_VOID_MAX, w: 1.2 },
  // 🐏 10.6.6 — BÉLIER (demande utilisateur) : il ne garde QUE le dessus, et seulement pendant
  // la MONTÉE — saut, ressort, geyser, jetpack, peu importe ce qui soulève. Un léger bouclier
  // coiffe alors le doodler, et la créature qu'il percute par en dessous est enfoncée : le seul
  // contact qui tuait en montant devient une victoire, et la charge se brise sur le coup.
  // ⚠ CUMULABLE (`max: Infinity`) : les charges s'empilent tant qu'aucune ne sert, et il ne s'en
  // dépense qu'UNE par percussion — le rendre unique en aurait fait un butin mort dès la 1re prise.
  // ⚠ Nommé `shRam`, pas `ram` : c'est le préfixe `sh` qui range un butin dans la FAMILLE des
  // boucliers partout ailleurs — les esprits ne le volent pas, la dalle qui rafle les améliorations
  // le laisse, sa pastille ne bleuit pas au gel. Le renommer, c'était le sortir des trois d'un coup.
  { k:'shRam',  icon:'🐏', label:'Bélier', txt:'tant que tu montes, un bouclier te coiffe : la créature que tu percutes par en dessous est enfoncée et lâche son coffre, et la charge se brise', max: Infinity, w: 1.8 },
  // 🧤 10.10.6 — IMMUNITÉ ÉLECTRIQUE (demande utilisateur) : des gants isolants qui rendent
  // invulnérable à tout ce qui tue au COURANT — la ⚡ Électrifiée et l'📡 Arc électrique.
  // ⚠ NON CUMULABLE (`max: 1`) : on l'a ou on ne l'a pas, une seconde paire ne protégerait de
  // rien de plus. Le tirage la retire du vivier une fois prise.
  // ⚠ Nommée `shZap`, avec le préfixe des BOUCLIERS : c'est lui qui, partout ailleurs, range un
  // butin dans la famille des protections — les 🕯️ esprits ne le volent pas, le 🚦 feu rouge ne
  // l'efface pas, la 🌨️ Congère ne le gèle pas et sa pastille ne bleuit donc pas. Une immunité
  // qui s'éteindrait au premier gel n'immunise rien ; ce que le gel enlève, c'est la puissance,
  // jamais la survie.
  // ⚠ Elle ne couvre QUE le courant. Le ⚙️ Piège à picots partage la ligne de code de la
  // ⚡ Électrifiée mais reste mortel : ce sont des piques de métal, pas de l'électricité.
  { k:'shZap',  icon:'🧤', label:'Immunité électrique', txt:'le courant ne t\'atteint plus : la ⚡ Électrifiée et l\'📡 Arc électrique crépitent sur toi sans mordre', max: 1, w: 1.5 },
  // 🧴 12.4.4 — PANACÉE (demande utilisateur) : le butin qui EFFACE d'un coup tout ce qui joue
  // contre le doodler à l'instant où le coffre s'ouvre — les malus à durée de la ☠️ case
  // malchance, les effets de tuile qui durent (🍄 vertige, 🎨 couleurs inversées, 🏜️ sable,
  // 🌨️ gel des bonus, 🪐 gravité, 🌁 brouillard, ❄️ glissade) ET le danger DÉJÀ ARMÉ des dalles
  // visibles : une 🌵 pique sortie se rétracte, une 🧨 mèche s'éteint, un 🔴 laser et un 🥚 gavé
  // rechargent depuis zéro, et la fenêtre active des tuiles à cycle (⚙️ picots, ⚡ Électrifiée)
  // se referme sur-le-champ.
  // ⚠ La liste des états soignés est CELLE DU BANDEAU (`doodlePerkHud`) : ce que le joueur voit
  // affiché comme malus est exactement ce que la panacée enlève. Deux listes séparées, et l'une
  // aurait fini par promettre ce que l'autre ne fait pas.
  // ⚠ Elle ne touche à RIEN de ce qui peut servir : ni au ⏱️ Ralentisseur (tout ralentit, les
  // créatures comprises — c'est aussi souvent une aide), ni aux 🖌️ teintes, ni aux tuiles bannies.
  // Une panacée qui reprend un avantage n'est plus un butin.
  // ⚠ INSTANTANÉE : comme les 📦 munitions, elle ne pose AUCUN niveau dans `s.wpn` (d'où
  // `D_LOOT_INST`) — un compteur que le 🚦 feu rouge effacerait ou que le 🪙 pari doublerait
  // n'aurait décrit qu'un effet déjà bu.
  { k:'cure',   icon:'🧴', label:'Panacée', txt:'tous tes malus en cours s\'effacent, et le danger déjà armé des dalles visibles se désamorce', max: Infinity, w: 2.5 },
];
// ⚠ Les butins INSTANTANÉS : ils agissent à la seconde où le coffre s'ouvre et ne posent aucun
// niveau dans `s.wpn`. Tout ce qui parcourt D_LOOT pour LIRE, doubler, voler ou effacer un
// niveau doit les sauter — sans quoi le 🪙 pari « doublerait » une panacée déjà bue et le vivier
// des butins croirait la trouver au plafond.
const D_LOOT_INST = new Set(['ammo', 'cure']);
// Vrai tant que le doodler porte les gants. ⚠ Lu DIRECTEMENT sur `s.wpn` et non par
// `doodleWpnOf` : ce dernier renvoie 0 pendant un gel, et l'immunité aurait lâché juste au
// moment où le joueur compte dessus.
function doodleZapImmune(s) { return !!(s.wpn && s.wpn.shZap > 0); }
const D_LASER_V = 2.2;             // 🔆 le trait part bien plus vite qu'une balle
const D_LASER_PIERCE = 99;         // … et ne s'arrête sur rien
const D_WPN_RATE = 3;              // ⚠ gain de cadence de « Cadence » — unique, donc appliqué une seule fois
const D_BULLET_BOOM_R = 34;        // 💥 souffle d'une balle explosive : bien plus court que D_BOOM_R (bouclier)
const D_SPREAD_DX = 1.5;           // écartement horizontal ajouté par balle d'éventail
function doodleShotGap(s) { return Math.max(2, D_SHOT_GAP - Math.min(4, doodlePerkOf(s, 'gun')) - (doodleWpnOf(s, 'rate') > 0 ? D_WPN_RATE : 0)); }
// ⚠ Les améliorations sont figées DANS la balle au moment du tir : ramasser « Perforant »
// pendant qu'une balle est en l'air ne doit pas la transformer en vol.
function doodleBullet(s, x, y, vx, vy) {
  const laser = doodleWpnOf(s, 'laser') > 0;
  return { x, y, vx: laser ? vx * D_LASER_V : vx, vy: laser ? vy * D_LASER_V : vy,
           pierce: laser ? D_LASER_PIERCE : doodleWpnOf(s, 'pierce'), boom: doodleWpnOf(s, 'boom') > 0, laser, sz: doodleBigMul(s),
           flame: (s.flame || 0) > 0 };   // 🔥 le jet de lance-flammes : voir la 🔥 Flamme éternelle
}
// 🚀 Missile téléguidé. ⚠ Il vole MOINS vite qu'une balle : c'est le prix de la poursuite,
// sans quoi il rendrait le tir ordinaire inutile. Son virage est BORNÉ (D_MISSILE_TURN rad par
// frame) — un missile qui pivoterait instantanément serait une mort automatique du monstre, pas
// une trajectoire. Et il a une durée de vie : privé de cible, il file droit et sort de l'écran ;
// face à une cible qu'il n'arrive pas à recouper, il tournerait sinon indéfiniment.
const D_MISSILE_V = 4.6, D_MISSILE_TURN = 0.12, D_MISSILE_GAP = 45, D_MISSILE_BOOM = 52, D_MISSILE_LIFE = 300;
// 🚀 10.5.4 — 2e PALIER DU MISSILE (demande utilisateur) : « si on le cumule avec le même
// bonus, le missile tire tout seul dès qu'un ennemi est visible ». Le 1er palier ne change
// pas — le missile accompagne toujours les tirs — le 2e AJOUTE un départ automatique.
// ⚠ Cadence PROPRE et bien plus lente que celle du missile d'accompagnement : à
// D_MISSILE_GAP, la tourelle aurait rempli l'écran de fusées et supprimé le tir.
// ⚠ Il ne coûte AUCUNE munition et ne passe pas par `shoot` : c'est une tourelle, pas un
// tir — à sec de munitions elle continue, et c'est exactement ce que le palier promet.
// ⚠ « Visible sur la carte » = À L'ÉCRAN : viser un monstre hors champ aurait fait partir
// des missiles vers le vide sans que rien ne l'explique.
const D_MISSILE_AUTO_GAP = 110;
function doodleMobOnScreen(s, H) { return s.monsters.some(m => m.alive && m.y > -20 && m.y < H + 20); }
// Cible = le monstre VIVANT le plus proche, réévalué à chaque frame : celui qu'on visait peut
// mourir d'une balle partie après le missile, qui doit alors se reporter sur un autre.
// ⚠ 11.2.2 — DANS L'ARÈNE, LA SEULE CIBLE EST LE BOSS. L'arène est vidée de ses créatures,
// donc sans ce court-circuit le missile ne trouvait plus rien et repartait tout droit — un
// 🚀 inutile pendant le seul combat où il compte. La boîte renvoyée a la forme d'un monstre
// (`x/y/w/h` coin haut-gauche) : `doodleMissileSteer` vise son centre sans rien savoir du boss.
function doodleMissileTarget(s, b) {
  if (s.boss) return { x: s.boss.x - D_BOSS_W / 2, y: D_BOSS_Y - D_BOSS_H / 2, w: D_BOSS_W, h: D_BOSS_H };
  let best = null, bd = Infinity;
  for (const m of s.monsters) {
    if (!m.alive) continue;
    const d = Math.hypot(m.x + m.w / 2 - b.x, m.y + m.h / 2 - b.y);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}
function doodleMissileSteer(s, b, sf) {
  const m = doodleMissileTarget(s, b);
  if (!m) return;
  const want = Math.atan2(m.y + m.h / 2 - b.y, m.x + m.w / 2 - b.x);
  let d = want - Math.atan2(b.vy, b.vx);
  while (d > Math.PI) d -= Math.PI * 2;                                   // ⚠ écart RAMENÉ dans [-π, π] : sans ça le missile fait le tour par le mauvais côté
  while (d < -Math.PI) d += Math.PI * 2;
  const a = Math.atan2(b.vy, b.vx) + Math.max(-D_MISSILE_TURN * sf, Math.min(D_MISSILE_TURN * sf, d));
  b.vx = Math.cos(a) * D_MISSILE_V; b.vy = Math.sin(a) * D_MISSILE_V;     // ⚠ vitesse RÉIMPOSÉE : elle ne doit dépendre que du cap, jamais s'éroder au fil des virages
}
function doodleMissile(s) { return { x: s.px, y: s.py - 18, vx: 0, vy: -D_MISSILE_V, pierce: 0, boom: true, boomR: D_MISSILE_BOOM, laser: false, missile: true, life: D_MISSILE_LIFE, sz: doodleBigMul(s) }; }
function doodleLootLvl(s, k) { return D_LOOT_INST.has(k) ? 0 : (s.wpn[k] || 0); }
// ⚠ Encaissement CENTRALISÉ : trois endroits infligent des dégâts (pique armée, monstre, trou
// noir) et dupliquaient chacun leur cascade de protections — c'était la garantie qu'un
// bouclier finisse par n'être honoré que dans deux cas sur trois. Renvoie false = mort.
function doodleHurt(s) {
  if (s.inv > 0) return true;
  // 🖌️ Teintes qui protègent. ⚠ ⚪ Statue et ⚫ Ombre ne posent PAS `s.inv` : leur protection
  // court déjà sur leur propre décompte, et l'invulnérabilité ordinaire explose en s'éteignant
  // (voir D_BOOM_R) — elles auraient offert une bombe gratuite à chaque coup encaissé.
  if (doodlePaintIs(s, 'marble') || doodlePaintIs(s, 'shadow')) return true;
  // 🟤 Écorce : elle encaisse UN coup et s'en va. Placée AVANT les boucliers : c'est un
  // consommable de peau, le laisser derrière une carapace l'aurait condamné à ne jamais servir.
  if (doodlePaintIs(s, 'bark')) { s.inv = D_INV; doodlePaintEnd(s, 'elle a encaissé le coup'); return true; }
  if (s.shTimeLeft > 0) { s.inv = D_INV; return true; }                                   // ⏳ absorbe sans se consommer : il court sur des points, pas sur des coups
  if (s.wpn.shHit > 0) { s.wpn.shHit--; s.inv = D_INV; s.toast = { txt: `🛡️ Bouclier ! ${s.wpn.shHit} restant(s)`, life: D_TOAST_LIFE }; return true; }
  if (s.armorLeft > 0) { s.armorLeft--; s.inv = D_INV; s.toast = { txt: `🛡️ Carapace ! ${s.armorLeft} restante(s)`, life: D_TOAST_LIFE }; return true; }
  // 💀 Revenant : le DERNIER filet, après tous les boucliers. Il ne se dépense donc que sur un
  // coup que plus rien d'autre n'aurait arrêté — c'est ce qui en fait une vie, pas un bouclier.
  if (doodlePaintIs(s, 'revenant')) { s.inv = D_INV; doodlePaintEnd(s, 'elle t\'a relevé'); return true; }
  return false;
}
// Butins encore disponibles : ceux dont le palier maximal n'est pas atteint.
function doodleLootPool(s) { return D_LOOT.filter(l => doodleLootLvl(s, l.k) < l.max); }
function doodleLootGrant(s) {
  const pool = doodleLootPool(s);
  // Tirage PONDÉRÉ par `w` (roue de la fortune) : le tirage uniforme sortait un laser aussi
  // souvent qu'une recharge. ⚠ Les poids se renormalisent sur le pool RESTANT — un butin
  // épuisé ne « gèle » donc pas sa part, elle se redistribue sur les autres.
  let l = D_LOOT[0];   // tout est au maximum : le coffre rend des munitions plutôt que rien
  if (pool.length) {
    const tot = pool.reduce((a, x) => a + x.w, 0);
    let r = Math.random() * tot;
    l = pool[pool.length - 1];
    for (const x of pool) { if (r < x.w) { l = x; break; } r -= x.w; }
  }
  if (l.k === 'ammo') s.ammo += D_AMMO_PICK;
  // 🧴 Panacée : elle agit tout de suite et NOMME ce qu'elle a balayé — « rien à soigner » est
  // une information, pas un butin raté. D'où le toast à elle et le retour anticipé.
  else if (l.k === 'cure') {
    const got = doodleCure(s);
    // 🧴 12.7.2 — RIEN À SOIGNER ⇒ ELLE ATTEND (demande utilisateur) : bue sur un joueur net,
    // la panacée était un butin perdu. Elle part en RÉSERVE (`s.cureHold`) et se boit toute seule
    // à la première chose à soigner — voir `doodleCureHold`.
    if (!got.length) {
      s.cureHold = (s.cureHold || 0) + 1;
      s.toast = { txt: `🧴 Panacée — rien à soigner, elle attend en réserve${s.cureHold > 1 ? ' ×' + s.cureHold : ''}`, life: D_TOAST_LIFE * 1.4 };
      return l;
    }
    s.toast = { txt: `🧴 Panacée — ${got.join(' ')} balayé${got.length > 1 ? 's' : ''}`, life: D_TOAST_LIFE * 1.4 };
    return l;
  }
  else {
    s.wpn[l.k]++;
    if (l.k === 'shTime') s.shTimeLeft += D_SHTIME;
    // ✴️ Les lames sont des OBJETS, pas un compteur : chacune porte sa phase sur l'orbite,
    // et une reprise vient s'intercaler entre celles déjà en vol au lieu de les repousser.
    if (l.k === 'shuriken') { s.shur = s.shur || []; for (let i = 0; i < D_SHURIKEN_N; i++) s.shur.push({ a: i / D_SHURIKEN_N * Math.PI * 2 + Math.random() * 0.3 }); }
  }
  const lvl = doodleLootLvl(s, l.k);
  s.toast = { txt: `${l.icon} ${l.label}${l.max > 1 && lvl > 1 ? ' ×' + lvl : ''} · ${l.txt}`, life: D_TOAST_LIFE };
  return l;
}
// 🌌 Le trou noir se retourne : il épargne le doodler et se gorge des créatures VISIBLES, dont
// le butin part directement au joueur. ⚠ Les butins sont accordés à la main (`doodleLootGrant`)
// et non par `doodleKillMonster` : celui-ci ferait tomber des coffres à ramasser, alors que la
// promesse est de « donner les coffres au joueur ». ⚠ Un seul BANDEAU en fin de course, jamais
// un toast par créature : dix butins d'affilée n'auraient laissé lire que le dernier.
function doodleVoidSurvive(s, h, H) {
  s.wpn.shVoid--;
  s.inv = D_INV;                                        // ⚠ comme un bouclier : sans ce répit, on retombe dans le même trou à la frame suivante
  const got = [];
  for (const m of s.monsters) {
    if (!m.alive || m.y < -40 || m.y > H + 40) continue;
    m.alive = false;
    s.questKills = (s.questKills || 0) + 1;             // englouti reste tué : les quêtes de chasse comptent aussi ces créatures
    const mx = m.x + m.w / 2, my = m.y + m.h / 2;
    for (let k = 0; k < 10; k++) s.parts.push({ x: mx, y: my, vx: (h.x - mx) / 20, vy: (h.y - my) / 20, life: 26, max: 26, sz: 3, c: k % 2 ? '#c3b7f2' : '#ffffff' });   // traînée ASPIRÉE vers le trou : c'est elle qui montre qui a été avalé
    if (!doodleClassic(s)) got.push(doodleLootGrant(s));
  }
  s.booms.push({ x: h.x, y: h.y, r: h.r * 2.2, life: D_BOOM_LIFE, max: D_BOOM_LIFE });   // onde purement DÉCORATIVE : elle ne passe pas par `doodleBoom`, qui tuerait une seconde fois
  s.toast = null;
  s.banner = { txt: '🌌 Survivant du trou noir !', sub: got.length ? `${got.length} créature(s) englouties · ${got.map(l => l.icon).join(' ')}` : 'rien à engloutir alentour', life: D_BANNER_LIFE };
}
// ⚠ Mort d'un monstre CENTRALISÉE : elle est déclenchée de quatre endroits (balle, écrasement,
// souffle du bouclier, bombe) et chacun doit lâcher son coffre. Dupliquer ce bloc, c'était
// garantir qu'un des quatre finisse par l'oublier.
// ⚠ 10.7.5 — LE PAVOIS DU 🛡️ RÉFLECTEUR EST HONORÉ ICI, et non plus seulement dans la boucle
// des balles (correctif). La règle annoncée est « seuls le 🚀 missile et l'écrasement en
// viennent à bout » ; or tout ce qui tue SANS projectile passait à côté du garde-fou et le
// pulvérisait quand même : le souffle d'une balle explosive ou d'une 🧨 Bombe, la ☠️ Destructrice,
// la foudre du 🟡 Paratonnerre, la traînée 🟢 Toxique, l'onde de la 🔨 Enclume. Avec le
// 🔆 Laser — qui traverse tout et fait éclater chaque créature qu'il croise quand on porte
// 💥 Explosives — le pavois ne servait tout bonnement plus à rien.
// `force` = les DEUX seules façons annoncées d'en venir à bout : le missile (via `doodleStrike`,
// où les autres projectiles ne parviennent jamais) et le contact physique (écrasement, 🐏 bélier,
// teintes 🔴 Soif de sang et 🟧 Colosse). Tout le reste ne fait que faire sonner le pavois.
function doodleKillMonster(s, m, force) {
  if (!m.alive) return;
  if (m.shield && !force) { m.sh = D_SHLD_FLASH; return; }
  m.alive = false;
  s.questKills = (s.questKills || 0) + 1;   // 🎯 comptée ICI : c'est le seul point de passage des quatre façons de tuer
  const c = m.rare ? '#e2564a' : m.type === 1 ? '#d04b7b' : m.type === 2 ? '#8a7bd8' : '#7b4bd0';
  for (let k = 0; k < (m.rare ? 16 : 9); k++) s.parts.push({ x: m.x + m.w / 2, y: m.y + m.h / 2, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, life: 24, max: 24, sz: 4, c });
  // ⚠ La créature TRÈS rare du biome lâche DEUX coffres : c'est ce qui récompense de l'avoir
  // affrontée plutôt que contournée. Ils sont décalés pour ne pas tomber l'un dans l'autre.
  // 🦴 Squelette d'ossuaire : il ne MEURT pas, il s'effondre en tas d'os et se reconstruit.
  // ⚠ Et il ne lâche AUCUN coffre : c'est le prix de son immortalité — sans cette règle, une
  // dalle d'ossuaire aurait été une machine à butin qu'il suffisait d'arroser.
  // ⚠ `alive = false` le rend inoffensif et le sort du tir ; le filtre de fin de frame l'épargne
  // tant que `bones > 0`, et c'est la boucle des monstres qui le relève.
  if (m.revive) { m.bones = D_SKEL_DOWN + D_SKEL_REBUILD; m.vx = 0; m.vy = 0; return; }
  if (doodleClassic(s)) return;   // 🎮 Classique : pas de coffres, donc pas de butins
  // ⚠ L'étalement est DÉRIVÉ de `n` et centré, et non écrit en dur pour deux : c'est ce qui
  // le laisse juste si un jour une créature en lâche davantage.
  // ⚠ `m.loot` prime sur la rareté : une créature peut fixer son butin sans rien devoir à
  // l'auréole ni au taux d'apparition d'une « très rare » — c'est le cas de la 𓁿 momie, qui
  // n'en vaut qu'un depuis 11.1.8 mais tombe désormais à cinq.
  const n = m.loot || (m.rare ? 2 : 1);
  for (let i = 0; i < n; i++) s.chests.push({ x: m.x + m.w / 2 - D_CHEST_W / 2 + (n > 1 ? (i - (n - 1) / 2) * 15 : 0), y: m.y + m.h / 2, w: D_CHEST_W, h: D_CHEST_H, vy: 0, landed: false, taken: false, plat: null });
}
// ⚠ 9.1.5 — LE BOUCLIER EXPLOSE EN S'ÉTEIGNANT et tue les monstres proches (demande
// utilisateur). C'est le pendant offensif du halo : au lieu de simplement redevenir
// vulnérable au pire moment (retombée après un vol), on nettoie ce qui nous entoure.
const D_BOOM_R = 96, D_BOOM_LIFE = 20;
// Souffle partagé par le bouclier ET par la tuile 🧨 Bombe : tue tout monstre dont le CENTRE
// est dans le rayon, crache des particules et pose l'onde de choc à dessiner.
function doodleBoom(s, x, y, r) {
  s.booms.push({ x, y, r, life: D_BOOM_LIFE, max: D_BOOM_LIFE });
  for (const m of s.monsters) {
    if (!m.alive) continue;
    if (Math.hypot(m.x + m.w / 2 - x, m.y + m.h / 2 - y) > r) continue;
    doodleKillMonster(s, m);
  }
  for (let k = 0; k < 14; k++) { const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 4; s.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 20, max: 20, sz: 3, c: k % 2 ? '#ffd54a' : '#ff8c3a' }); }
}
function doodleBoomDraw(ctx, b) {
  const k = 1 - b.life / b.max;                       // 0 → 1 : l'onde s'ouvre en s'effaçant
  ctx.save();
  ctx.globalAlpha = Math.max(0, b.life / b.max) * 0.85;
  ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 5 * (1 - k) + 1.5;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.25 + k * 0.85), 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#ff8c3a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.1 + k * 0.6), 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
function doodleRR(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
}
// ⚠ 9.3.6 — TRANSITION PROGRESSIVE (demande utilisateur) : le décor ne bascule plus d'un coup
// au passage d'un palier, il se FOND sur les D_BIOME_FADE derniers points avant le changement.
// Le mélange se fait sur les couleurs, pas sur deux fonds superposés : un seul rendu, aucun
// coût, et la teinte reste juste même si le palier est franchi d'un seul vol de jetpack.
const D_BIOME_FADE = 220;
function doodleMix(a, b, t) {
  const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const c = v => Math.round(v).toString(16).padStart(2, '0');
  return '#' + c(r1 + (r2 - r1) * t) + c(g1 + (g2 - g1) * t) + c(b1 + (b2 - b1) * t);
}
// ⚠ 9.5.4 — LES COULEURS DU CARNET FUSIONNENT (demande utilisateur) : le papier, les lignes et
// la marge sont le mélange de TOUS les biomes traversés, pas seulement du courant.
// ⚠ C'est le seul empilement qui reste : depuis 10.8.9 les TUILES, elles, ne se cumulent plus
// (le biome courant plus un vestige, voir `doodleBiomeTilesAt`). Le décor peint la mémoire de
// la partie, le tirage joue l'endroit où l'on est.
// ⚠ Le mélange est PONDÉRÉ vers le dernier arrivé : une moyenne à parts égales aurait viré au
// gris de plus en plus terne à mesure qu'on empile les paliers, et les ambiances auraient fini
// par se ressembler exactement là où la partie devient longue.
const D_BIOME_MERGE = 0.62;
function doodleBiomePal(s, tier) {
  const b0 = D_BIOMES[doodleBiomeAt(s, 0)];
  let acc = { paper: b0.paper, rule: b0.rule, marge: b0.marge };
  for (let k = 1; k <= tier; k++) {
    const b = D_BIOMES[doodleBiomeAt(s, k)];
    acc = { paper: doodleMix(acc.paper, b.paper, D_BIOME_MERGE),
            rule:  doodleMix(acc.rule,  b.rule,  D_BIOME_MERGE),
            marge: doodleMix(acc.marge, b.marge, D_BIOME_MERGE) };
  }
  return acc;
}
// Toutes les tuiles de biome acquises jusqu'au palier `tier`, dans l'ordre de découverte.
// ⚠ Dédoublonnée : deux paliers peuvent tirer le même biome à distance, sa tuile ne doit pas
// pour autant peser double dans le tirage.
// ⚠ 10.8.9 — LES BIOMES NE S'EMPILENT PLUS (demande utilisateur). Le vivier des tuiles de
// biome d'un palier, c'est celui du biome COURANT — et rien d'autre. De 9.5.4 à 10.8.8 toutes
// les tuiles traversées restaient en jeu : au sixième palier, dix-huit tuiles se partageaient
// la même bande de tirage et aucun biome n'avait plus d'identité propre.
function doodleBiomeTilesAt(s, tier) {
  return D_BIOMES[doodleBiomeAt(s, tier)].tiles.map(t => t.k);
}
// … à une exception près : LE VESTIGE. À chaque changement de biome, UNE tuile du biome qu'on
// quitte est tirée au sort et reste tirable dans le suivant, à taux faible (D_RELIC_SHARE de
// la bande des tuiles de biome, soit moins de 1 % des rangées). Le biome qu'on vient de
// traverser laisse donc une trace, sans noyer celui où l'on est.
// ⚠ Il est MÉMORISÉ par palier, comme le biome lui-même : le retirer à chaque frame le ferait
// changer d'une dalle à l'autre, et ce ne serait plus un vestige mais un tirage de plus.
// ⚠ Il ne vaut QUE pour le palier suivant : au palier d'après, c'est le vestige de CE
// palier-là qui prend sa place. Rien ne s'accumule.
const D_RELIC_SHARE = 0.15;
function doodleBiomeRelic(s, tier) {
  if (tier <= 0 || doodleClassic(s)) return null;
  if (!s.relics) s.relics = [];
  if (s.relics[tier] === undefined) {
    const prev = D_BIOMES[doodleBiomeAt(s, tier - 1)].tiles;
    s.relics[tier] = prev.length ? prev[Math.floor(Math.random() * prev.length)].k : null;
  }
  return s.relics[tier];
}
// Toutes les tuiles de biome DÉJÀ VUES dans la partie. ⚠ Ne sert PAS à décider si une rangée
// devient une tuile de biome (voir ci-dessus) : seulement aux systèmes qui rejouent quelque
// chose de déjà rencontré — le vivier de la 🌈 Peinture instable, et le déguisement du
// 🦎 Caméléon, qui ne doit imiter que ce que cette partie-là peut produire.
function doodleBiomeSeen(s, tier) {
  const out = [];
  for (let k = 0; k <= tier; k++) {
    for (const t of D_BIOMES[doodleBiomeAt(s, k)].tiles) if (out.indexOf(t.k) < 0) out.push(t.k);
  }
  return out;
}
// Couleurs du décor à l'instant `score` : la fusion des biomes traversés, fondue vers celle
// qu'elle deviendra au palier suivant. Renvoie toujours un objet prêt à peindre.
function doodleBiomeCols(s, score) {
  const tier = doodleTier(score), cur = doodleBiomePal(s, tier);
  // ⚠ Tire le biome de la tranche SUIVANTE avec ~220 points d'avance : c'est ce qui permet au
  // fondu d'exister. Le tirage étant mémorisé, celui qui s'affichera sera bien celui-là.
  const nxt = doodleBiomePal(s, tier + 1);
  const reste = (tier + 1) * D_BIOME_STEP - score;          // points restants avant le palier
  if (reste > D_BIOME_FADE) return cur;
  const t = Math.max(0, Math.min(1, 1 - reste / D_BIOME_FADE));
  return { paper: doodleMix(cur.paper, nxt.paper, t), rule: doodleMix(cur.rule, nxt.rule, t), marge: doodleMix(cur.marge, nxt.marge, t) };
}
// ⚠ Palier QUANTIFIÉ du fondu : le repose-pouce est du DOM, il ne peut pas se recolorer à
// chaque frame sans provoquer un rendu React par frame. Ce jeton ne change que 8 fois par
// transition — le dégradé reste lisible à l'œil pour un coût négligeable.
function doodleBiomeFadeStep(score) {
  const i = doodleTier(score), reste = (i + 1) * D_BIOME_STEP - score;
  return i * 16 + (reste > D_BIOME_FADE ? 0 : Math.min(8, Math.floor((1 - reste / D_BIOME_FADE) * 8) + 1));
}
// 🎨 9.8.2 — IDENTITÉ GRAPHIQUE PAR BIOME (demande utilisateur). Avant le 1er palier
// (1000 points), le fond reste la PAGE DE CARNET d'origine, seules ses trois couleurs
// suivant le biome. À partir de 1000 points, un VRAI décor la recouvre : ciel dégradé
// franchement saturé + éléments dessinés propres au biome, en parallaxe sur `climb`.
// ⚠ Les ciels sont choisis pour CONTRASTER avec le vert des plateformes (bleu, ocre, glace,
// braise, nuit) : un décor vert sur des dalles vertes aurait rendu la montée illisible, ce
// qui n'est pas « cacher un peu les tuiles » mais rendre le jeu injouable.
const D_SCENE = {
  foret:   { sky:['#4fbdf0', '#a8e86a'], far:'#5aa83c', near:'#2f7a24', ink:'#1c4d14' },
  desert:  { sky:['#e8892c', '#ffdf9e'], far:'#d99a4a', near:'#b26a22', ink:'#6f3a0e' },
  glacier: { sky:['#1f7fc4', '#dff4ff'], far:'#9ed8f2', near:'#f2fbff', ink:'#215f8a' },
  volcan:  { sky:['#3c0808', '#ff7a30'], far:'#4a1210', near:'#240808', ink:'#ffcf6a' },
  cosmos:  { sky:['#0d0726', '#4b2f8f'], far:'#2a1a5e', near:'#150d33', ink:'#ffe9a8' },
  // 🌊 Sous l'eau : le HAUT de l'écran est la surface, le bas les profondeurs — on monte donc
  // vers la lumière. ⚠ L'inverse (sombre en haut) aurait dit qu'on plonge, alors qu'on grimpe.
  ocean:   { sky:['#7fe3f2', '#04305c'], far:'#0b6a86', near:'#063f5e', ink:'#bff2ff' },
  // 🌃 Nuit urbaine : violet profond en haut, halo magenta de la pollution lumineuse en bas.
  // Les deux plans de gratte-ciel sont presque NOIRS — ce sont les néons qui doivent éclairer,
  // pas les façades, sinon la ville avale les dalles.
  city:    { sky:['#12082e', '#5a1462'], far:'#150c36', near:'#0b0722', ink:'#ff3fa8' },
  // ☁️ Plein ciel : azur franc en haut, lumière dorée en bas (on monte vers le soleil).
  // `far`/`near` sont ici les DEUX teintes de cumulus, pas des reliefs : le biome n'a pas de sol.
  nuages:  { sky:['#2f7fd8', '#dff0ff'], far:'#c3ddf3', near:'#ffffff', ink:'#5f93c8' },
  // 🔥 Enfer : NOIR EN HAUT, ROUGE SANG EN BAS — on remonte d'un gouffre en feu vers la voûte
  // obscure. ⚠ L'inverse (clair en haut) aurait dit qu'on s'échappe vers la lumière, alors que
  // tout le biome raconte qu'on s'enfonce. `far`/`near` sont deux plans de roche presque noirs :
  // ce sont les FISSURES incandescentes qui doivent éclairer, jamais les parois — sinon le décor
  // avale les dalles, exactement comme les façades de Night City.
  enfer:   { sky:['#0a0407', '#5a0d0a'], far:'#1c070b', near:'#0b0305', ink:'#ff5a2a' },
  // 🔒 Prison : nuit froide au-dessus de la cour. `far`/`near` sont les DEUX enceintes de béton,
  // et `ink` la lumière jaune des miradors — la seule chose colorée du biome.
  prison:  { sky:['#0f1622', '#2f3a4a'], far:'#39404e', near:'#232935', ink:'#ffe08a' },
};
// ⚠ Positions DÉTERMINISTES : un Math.random() par frame ferait grésiller tout le décor.
// Hachage classique sinus × grand nombre — reproductible, sans état à porter.
function doodleRnd(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
// Décalage d'une couche en parallaxe qui se répète tous les `span` px.
function doodleParallax(climb, par, span, phase) { return (((climb * par + (phase || 0)) % span) + span) % span; }
// Une bande de relief (collines, dunes, crêtes) répétée verticalement. `wave(fx)` donne la
// hauteur du relief pour l'abscisse normalisée `fx`, `depth` l'épaisseur du socle sous la crête.
// ⚠ `depth` doit rester BIEN INFÉRIEUR à `span` : à `depth = span` les bandes se rejoignent et
// noient tout l'écran sous un aplat — le ciel disparaît et les dalles ne se détachent plus.
function doodleRidge(ctx, W, H, off, span, fill, wave, depth) {
  ctx.fillStyle = fill;
  for (let base = off - span; base < H + span; base += span) {
    ctx.beginPath();
    ctx.moveTo(0, base);
    for (let px = 0; px <= W; px += 10) ctx.lineTo(px, base - wave(px / W));
    ctx.lineTo(W, base + depth); ctx.lineTo(0, base + depth); ctx.closePath(); ctx.fill();
  }
}
// Décor complet d'un biome. `a` = opacité, ce qui permet de FONDRE un palier dans le suivant.
function doodleScene(ctx, W, H, climb, k, a) {
  const sc = D_SCENE[k];
  if (!sc || a <= 0.004) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, a);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, sc.sky[0]); g.addColorStop(1, sc.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (k === 'foret') {
    // Collines en deux plans, futaie de sapins sur le plan lointain, herbe et fleurs sur le
    // plus proche, pétales au vent.
    const offFar = doodleParallax(climb, 0.07, 240);
    doodleRidge(ctx, W, H, offFar, 240, sc.far, fx => 26 + Math.sin(fx * 6.2) * 16, 34);
    // Sapins en silhouette sur la crête lointaine — c'est eux qui font la FORÊT, la crête
    // seule ne disait qu'une colline. ⚠ Sur le plan LOINTAIN et en une seule teinte sombre :
    // détaillés au premier plan, ils auraient concurrencé les dalles à l'œil.
    ctx.fillStyle = '#2f6b23';
    for (let base = offFar - 240; base < H + 240; base += 240) {
      for (let i = 0; i < 9; i++) {
        const fx = (i + 0.5) / 9, bx = fx * W, by = base - (26 + Math.sin(fx * 6.2) * 16);
        const hgt = 26 + doodleRnd(i + 90) * 20, wd = 7 + doodleRnd(i + 95) * 4;
        for (let j = 0; j < 3; j++) {
          const ty = by - hgt * (0.32 + j * 0.26), tw = wd * (1 - j * 0.24);
          ctx.beginPath(); ctx.moveTo(bx, ty - hgt * 0.34); ctx.lineTo(bx - tw, ty); ctx.lineTo(bx + tw, ty); ctx.closePath(); ctx.fill();
        }
        ctx.fillRect(bx - 1.4, by - hgt * 0.34, 2.8, hgt * 0.34);
      }
    }
    const off = doodleParallax(climb, 0.15, 190);
    doodleRidge(ctx, W, H, off, 190, sc.near, fx => 18 + Math.sin(fx * 9 + 1.2) * 12, 26);
    ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (let base = off - 190; base < H + 190; base += 190) {
      for (let i = 0; i < 12; i++) {
        const fx = (i + 0.5) / 12, bx = fx * W, by = base - (18 + Math.sin(fx * 9 + 1.2) * 12);
        ctx.strokeStyle = sc.ink;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + 3, by - 7, bx + 7, by - 9); ctx.stroke();
        if (i % 3 === 1) { ctx.fillStyle = i % 2 ? '#ffd54a' : '#ff8fc8'; ctx.beginPath(); ctx.arc(bx + 7, by - 10, 2.4, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 10; i++) {
      const px = ((doodleRnd(i) * W + climb * 0.35 * (0.4 + doodleRnd(i + 40))) % (W + 20) + W + 20) % (W + 20) - 10;
      const py = doodleParallax(climb, 0.5 + doodleRnd(i + 9) * 0.4, H + 40, doodleRnd(i + 3) * H);
      ctx.beginPath(); ctx.ellipse(px, py, 3, 1.8, doodleRnd(i + 7) * 3, 0, Math.PI * 2); ctx.fill();
    }
  } else if (k === 'desert') {
    // Soleil FIXE (il est à l'infini, il ne défile pas), dunes, cactus, ondes de chaleur.
    ctx.fillStyle = 'rgba(255,236,170,0.55)'; ctx.beginPath(); ctx.arc(W - 62, 74, 52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(W - 62, 74, 27, 0, Math.PI * 2); ctx.fill();
    doodleRidge(ctx, W, H, doodleParallax(climb, 0.06, 250), 250, sc.far, fx => 30 + Math.sin(fx * 4.4 + 0.6) * 20, 36);
    const off = doodleParallax(climb, 0.14, 200);
    doodleRidge(ctx, W, H, off, 200, sc.near, fx => 20 + Math.sin(fx * 7 + 2.1) * 14, 28);
    ctx.fillStyle = sc.ink;
    for (let base = off - 200; base < H + 200; base += 200) {
      [0.18, 0.62, 0.85].forEach((fx, j) => {
        const bx = fx * W, by = base - (20 + Math.sin(fx * 7 + 2.1) * 14), hgt = 16 + j * 5;
        ctx.fillRect(bx - 2.5, by - hgt, 5, hgt);
        ctx.fillRect(bx - 9, by - hgt * 0.7, 4, 2.5); ctx.fillRect(bx - 9, by - hgt * 0.7, 2.5, 8);
        ctx.fillRect(bx + 5, by - hgt * 0.55, 4, 2.5); ctx.fillRect(bx + 6.5, by - hgt * 0.55, 2.5, 7);
      });
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      const hy = doodleParallax(climb, 0.3, H + 60, i * 90);
      ctx.beginPath();
      for (let px = 0; px <= W; px += 12) ctx.lineTo(px, hy + Math.sin(px * 0.06 + climb * 0.02 + i) * 3);
      ctx.stroke();
    }
  } else if (k === 'glacier') {
    // Aurore en haut, deux crêtes de glace en dents de scie, neige qui tombe.
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(${140 + i * 20},255,${220 - i * 20},0.16)`;
      ctx.fillRect(0, 12 + i * 16 + Math.sin(climb * 0.01 + i) * 6, W, 11);
    }
    doodleRidge(ctx, W, H, doodleParallax(climb, 0.06, 260), 260, sc.far, fx => 22 + Math.abs(((fx * 3) % 1) - 0.5) * 76, 34);
    doodleRidge(ctx, W, H, doodleParallax(climb, 0.14, 210), 210, sc.near, fx => 14 + Math.abs(((fx * 4.5) % 1) - 0.5) * 58, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 26; i++) {
      const px = (doodleRnd(i) * W + Math.sin(climb * 0.014 + i) * 10 + W) % W;
      const py = doodleParallax(climb, 0.55 + doodleRnd(i + 5) * 0.5, H + 30, doodleRnd(i + 2) * H);
      ctx.beginPath(); ctx.arc(px, py, 1.1 + doodleRnd(i + 11) * 1.6, 0, Math.PI * 2); ctx.fill();
    }
  } else if (k === 'volcan') {
    // Cônes en silhouette, lueur et coulée du cratère, braises qui MONTENT (parallaxe inversée).
    doodleRidge(ctx, W, H, doodleParallax(climb, 0.06, 270), 270, sc.far, fx => 20 + Math.max(0, 62 - Math.abs(fx - 0.3) * 210), 40);
    const off = doodleParallax(climb, 0.13, 220);
    doodleRidge(ctx, W, H, off, 220, sc.near, fx => 14 + Math.max(0, 70 - Math.abs(fx - 0.72) * 240), 30);
    for (let base = off - 220; base < H + 220; base += 220) {
      const cx = 0.72 * W, cy = base - 84;
      ctx.fillStyle = 'rgba(255,140,58,0.35)'; ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = sc.ink; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + 12, cy + 34, cx + 4, base - 14); ctx.stroke();
    }
    ctx.fillStyle = '#ffb14a';
    for (let i = 0; i < 18; i++) {
      const px = (doodleRnd(i) * W + Math.sin(climb * 0.02 + i * 2) * 12 + W) % W;
      const py = H - doodleParallax(climb, -0.7 - doodleRnd(i + 6) * 0.6, H + 40, doodleRnd(i + 4) * H);
      ctx.globalAlpha = Math.min(1, a) * (0.35 + doodleRnd(i + 8) * 0.5);
      ctx.beginPath(); ctx.arc(px, py, 1.3 + doodleRnd(i + 13) * 1.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, a);
  } else if (k === 'enfer') {
    // Deux plans de roche dentelée, des fissures incandescentes qui les parcourent, et des
    // braises qui MONTENT (parallaxe inversée, comme au Volcan). ⚠ Le halo du gouffre est peint
    // AVANT les reliefs : posé après, il aurait blanchi la roche et tout le contraste serait parti.
    const glow = ctx.createRadialGradient(W * 0.5, H * 1.02, 10, W * 0.5, H * 1.02, H * 0.85);
    glow.addColorStop(0, 'rgba(255,90,42,0.55)'); glow.addColorStop(1, 'rgba(255,90,42,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    const offFar = doodleParallax(climb, 0.06, 260);
    doodleRidge(ctx, W, H, offFar, 260, sc.far, fx => 18 + Math.abs(Math.sin(fx * 9.1)) * 46, 42);
    const off = doodleParallax(climb, 0.13, 200);
    doodleRidge(ctx, W, H, off, 200, sc.near, fx => 12 + Math.abs(Math.sin(fx * 13.7 + 1.2)) * 54, 32);
    // Les fissures : de courts éclats coudés posés sur le plan proche, qui pulsent lentement.
    ctx.lineCap = 'round';
    for (let base = off - 200; base < H + 200; base += 200) {
      for (let i = 0; i < 5; i++) {
        const fx = doodleRnd(i + 31), px = fx * W, py = base + 6 + doodleRnd(i + 47) * 22;
        ctx.strokeStyle = sc.ink;
        ctx.globalAlpha = Math.min(1, a) * (0.30 + 0.35 * (0.5 + 0.5 * Math.sin(climb * 0.02 + i * 1.7)));
        ctx.lineWidth = 1.4 + doodleRnd(i + 53) * 1.6;
        ctx.beginPath();
        ctx.moveTo(px - 14, py); ctx.lineTo(px - 3, py - 7); ctx.lineTo(px + 6, py + 2); ctx.lineTo(px + 17, py - 5);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = Math.min(1, a);
    // Les braises. ⚠ Deux teintes en alternance : une seule et l'écran se lisait comme une pluie
    // de points, pas comme un feu.
    for (let i = 0; i < 22; i++) {
      const px = (doodleRnd(i) * W + Math.sin(climb * 0.025 + i * 2.1) * 14 + W) % W;
      const py = H - doodleParallax(climb, -0.75 - doodleRnd(i + 6) * 0.7, H + 40, doodleRnd(i + 4) * H);
      ctx.fillStyle = i % 3 ? '#ff7a2a' : '#ffd24a';
      ctx.globalAlpha = Math.min(1, a) * (0.30 + doodleRnd(i + 9) * 0.55);
      ctx.beginPath(); ctx.arc(px, py, 1.2 + doodleRnd(i + 14) * 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, a);
  } else if (k === 'prison') {
    // La COUR vue d'en bas : deux enceintes de béton à crête PLATE (un mur, pas une colline),
    // couronnées de rouleaux de barbelés, avec un mirador une bande sur deux et son faisceau.
    // ⚠ Crête plate et non ondulée : `doodleRidge` sert ici à empiler des MURS — une ondulation
    // en aurait refait des collines, et toute la lecture du biome serait tombée.
    const offFar = doodleParallax(climb, 0.06, 250);
    doodleRidge(ctx, W, H, offFar, 250, sc.far, () => 30, 46);
    const off = doodleParallax(climb, 0.13, 190);
    doodleRidge(ctx, W, H, off, 190, sc.near, () => 22, 34);
    for (let base = off - 190; base < H + 190; base += 190) {
      const crete = base - 22;
      // les rouleaux de barbelés sur la crête
      ctx.strokeStyle = '#7d8492'; ctx.lineWidth = 1.4;
      for (let bx = 6; bx < W; bx += 26) { ctx.beginPath(); ctx.arc(bx, crete - 5, 5.5, 0, Math.PI * 2); ctx.stroke(); }
      // le mirador, une bande sur deux, avec sa cabine éclairée
      const cote = ((base / 190) | 0) % 2 ? 0.18 : 0.78, mx = cote * W;
      ctx.fillStyle = sc.near;
      ctx.fillRect(mx - 4, crete - 54, 8, 54);                        // le fût
      ctx.fillRect(mx - 15, crete - 72, 30, 20);                      // la cabine
      ctx.fillStyle = '#141821';
      ctx.beginPath(); ctx.moveTo(mx - 19, crete - 72); ctx.lineTo(mx + 19, crete - 72); ctx.lineTo(mx, crete - 84); ctx.closePath(); ctx.fill();
      ctx.fillStyle = sc.ink; ctx.fillRect(mx - 10, crete - 68, 20, 10);   // la vitre allumée
      // le faisceau, qui balaie lentement — c'est lui qui fait la prison, pas le mur
      const bal = Math.sin(climb * 0.011 + base * 0.03) * 0.55;
      ctx.save(); ctx.translate(mx, crete - 63); ctx.rotate(bal);
      const gb = ctx.createLinearGradient(0, 0, 0, 120);
      gb.addColorStop(0, 'rgba(255,224,138,0.30)'); gb.addColorStop(1, 'rgba(255,224,138,0)');
      ctx.fillStyle = gb;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-34, 120); ctx.lineTo(34, 120); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = Math.min(1, a);
  } else if (k === 'cosmos') {
    // Nébuleuses, deux champs d'étoiles à des parallaxes différentes, une planète annelée.
    [[0.28, 0.3, 96, 'rgba(160,90,220,0.28)'], [0.74, 0.66, 120, 'rgba(70,150,230,0.22)']].forEach(([fx, fy, r, col]) => {
      const ny = doodleParallax(climb, 0.05, H + 260, fy * H);
      const rg = ctx.createRadialGradient(fx * W, ny, 4, fx * W, ny, r);
      rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    });
    for (let i = 0; i < 46; i++) {
      const px = doodleRnd(i) * W;
      const py = doodleParallax(climb, i % 2 ? 0.12 : 0.3, H + 40, doodleRnd(i + 1) * H);
      ctx.globalAlpha = Math.min(1, a) * (0.4 + doodleRnd(i + 21) * 0.6);
      ctx.fillStyle = i % 7 === 0 ? '#ffd9a8' : i % 5 === 0 ? '#a8d8ff' : '#ffffff';
      ctx.beginPath(); ctx.arc(px, py, 0.8 + doodleRnd(i + 31) * 1.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, a);
    const py = doodleParallax(climb, 0.05, H + 420, 120);
    ctx.fillStyle = '#c98bd8'; ctx.beginPath(); ctx.arc(58, py, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(66, py - 5, 20, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = sc.ink; ctx.lineWidth = 3;
    ctx.save(); ctx.translate(58, py); ctx.rotate(-0.42);
    ctx.beginPath(); ctx.ellipse(0, 0, 38, 9, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  } else if (k === 'ocean') {
    // Rais de lumière obliques venus de la surface, deux bancs de coraux/algues, bulles qui
    // MONTENT (parallaxe inversée, comme les braises du volcan) et poissons en silhouette.
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const bx = (i + 0.5) / 5 * W + Math.sin(climb * 0.006 + i) * 18;
      ctx.fillStyle = 'rgba(190,245,255,0.10)';
      ctx.beginPath(); ctx.moveTo(bx - 16, 0); ctx.lineTo(bx + 16, 0); ctx.lineTo(bx + 62, H); ctx.lineTo(bx + 18, H); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    doodleRidge(ctx, W, H, doodleParallax(climb, 0.06, 250), 250, sc.far, fx => 24 + Math.abs(Math.sin(fx * 5.1)) * 30, 36);
    const off = doodleParallax(climb, 0.14, 200);
    doodleRidge(ctx, W, H, off, 200, sc.near, fx => 16 + Math.abs(Math.sin(fx * 8.3 + 1.1)) * 20, 26);
    // Algues plantées sur la crête proche, qui ondulent avec le courant.
    ctx.strokeStyle = '#1f9a86'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    for (let base = off - 200; base < H + 200; base += 200) {
      for (let i = 0; i < 7; i++) {
        const fx = (i + 0.5) / 7, bx = fx * W, by = base - (16 + Math.abs(Math.sin(fx * 8.3 + 1.1)) * 20), hgt = 20 + doodleRnd(i + 60) * 22;
        ctx.beginPath(); ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + Math.sin(climb * 0.02 + i) * 11, by - hgt * 0.6, bx + Math.sin(climb * 0.02 + i) * 6, by - hgt);
        ctx.stroke();
      }
    }
    // Poissons : petites amandes sombres à contre-jour, qui traversent lentement.
    ctx.fillStyle = 'rgba(4,40,70,0.55)';
    for (let i = 0; i < 9; i++) {
      const dir = i % 2 ? 1 : -1;
      const px = ((doodleRnd(i) * W + climb * 0.28 * (0.5 + doodleRnd(i + 40)) * dir) % (W + 40) + W + 40) % (W + 40) - 20;
      const py = doodleParallax(climb, 0.35 + doodleRnd(i + 9) * 0.35, H + 60, doodleRnd(i + 3) * H);
      ctx.beginPath(); ctx.ellipse(px, py, 7, 3.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px - dir * 7, py); ctx.lineTo(px - dir * 13, py - 4); ctx.lineTo(px - dir * 13, py + 4); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(220,250,255,0.7)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 20; i++) {
      const px = (doodleRnd(i + 70) * W + Math.sin(climb * 0.02 + i) * 9 + W) % W;
      const py = H - doodleParallax(climb, -0.55 - doodleRnd(i + 6) * 0.5, H + 40, doodleRnd(i + 4) * H);
      ctx.beginPath(); ctx.arc(px, py, 1.4 + doodleRnd(i + 13) * 2.4, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (k === 'city') {
    // 🌃 10.9.3 — DÉCOR REPRIS (demande utilisateur) : de vraies TOURS cyberpunk à la place de
    // la simple silhouette en créneaux. Chaque tour est bâtie par retraits successifs, cerclée
    // d'un néon sur son arête, coiffée d'un mât à balise, et porte un panneau holographique.
    // ⚠ Tout est DÉTERMINISTE (`doodleRnd` sur une graine dérivée de l'index) : un Math.random
    // par frame, et la ville entière grésillerait d'une image à l'autre.
    // ⚠ Les façades restent presque NOIRES et c'est le néon qui éclaire : une ville lumineuse
    // avalait les dalles, qui sont le seul élément qu'on doit lire à coup sûr.
    const neons = ['#ff3fa8', '#3fe8ff', '#b3ff3f', '#ffb03f'];
    // Une tour : corps à retraits, arête néon, grille de fenêtres, panneau holo, mât à balise.
    const tower = (bx, base, bw, bh, seed, lit) => {
      const col = neons[Math.floor(doodleRnd(seed + 3) * neons.length)];
      const steps = 1 + Math.floor(doodleRnd(seed + 11) * 3);   // 1 à 3 retraits
      let cw = bw, cx2 = bx + bw / 2, top = base;
      for (let sI = 0; sI < steps; sI++) {
        const sh = bh * (sI === 0 ? 0.52 : 0.3 / Math.max(1, steps - 1));
        ctx.fillStyle = sc.near;
        ctx.fillRect(cx2 - cw / 2, top - sh, cw, sh + (sI === 0 ? 30 : 2));
        // L'arête néon : un filet vertical sur un bord, un liseré au sommet du retrait.
        ctx.save();
        ctx.globalAlpha = Math.min(1, a) * 0.85;
        ctx.fillStyle = col;
        ctx.fillRect(cx2 - cw / 2, top - sh, 1.6, sh);
        ctx.fillRect(cx2 - cw / 2, top - sh, cw, 1.4);
        ctx.globalAlpha = Math.min(1, a) * 0.16;                 // la diffusion du néon
        ctx.fillRect(cx2 - cw / 2 - 3, top - sh - 2, cw + 6, sh + 4);
        ctx.restore();
        if (lit) {                                               // les fenêtres allumées
          const cols2 = Math.max(1, Math.floor(cw / 6)), rows2 = Math.max(1, Math.floor(sh / 8));
          for (let ci = 0; ci < cols2; ci++) for (let ri = 0; ri < rows2; ri++) {
            const r0 = doodleRnd(seed * 13 + ci * 7 + ri * 3 + sI * 61);
            if (r0 < 0.70) continue;
            ctx.save();
            ctx.globalAlpha = Math.min(1, a) * (0.26 + r0 * 0.42);
            ctx.fillStyle = r0 > 0.94 ? col : r0 > 0.8 ? '#3fe8ff' : '#ffd54a';
            ctx.fillRect(cx2 - cw / 2 + 2.5 + ci * 6, top - sh + 3.5 + ri * 8, 2.6, 3.4);
            ctx.restore();
          }
        }
        top -= sh; cw *= 0.66 + doodleRnd(seed + sI + 21) * 0.16;
      }
      // Panneau holographique plaqué sur le socle : un rectangle lumineux barré de lignes de
      // balayage. ⚠ Il est SUR la façade et non au-dessus : une enseigne flottante se serait
      // lue comme un objet du premier plan.
      if (lit && doodleRnd(seed + 31) > 0.42) {
        const pw = Math.min(bw - 6, 15), ph = 22;
        const px2 = bx + bw / 2 - pw / 2, py2 = base - bh * 0.34;
        ctx.save();
        ctx.globalAlpha = Math.min(1, a) * (0.5 + Math.sin(climb * 0.04 + seed) * 0.2);
        ctx.fillStyle = col; ctx.fillRect(px2, py2, pw, ph);
        ctx.globalAlpha = Math.min(1, a) * 0.75;
        ctx.fillStyle = 'rgba(10,6,26,0.85)';
        for (let li = 0; li < 5; li++) ctx.fillRect(px2, py2 + 2 + li * 4.4, pw, 1.6);
        ctx.restore();
      }
      // Le mât et sa balise, qui bat. ⚠ Toutes les tours ne battent pas en même temps : la
      // phase vient de la graine, sinon la ville clignerait d'un seul œil.
      const mh = 8 + doodleRnd(seed + 41) * 14;
      ctx.fillStyle = sc.near; ctx.fillRect(cx2 - 1, top - mh, 2, mh);
      const on = (Math.floor(climb * 0.05 + seed * 7) % 6) < 3;
      ctx.save();
      ctx.globalAlpha = Math.min(1, a) * (on ? 0.95 : 0.2);
      ctx.fillStyle = '#e2564a';
      ctx.beginPath(); ctx.arc(cx2, top - mh - 2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return { cx: cx2, top, col };
    };
    // Plan LOINTAIN : des blocs sourds, sans fenêtre — ils ne servent qu'à donner de la
    // profondeur, les détailler aurait concurrencé les tours du plan proche.
    const offFar = doodleParallax(climb, 0.05, 270);
    ctx.fillStyle = sc.far;
    for (let base = offFar - 270; base < H + 270; base += 270) {
      let px = -10, i = 0;
      while (px < W) {
        const bw = 16 + doodleRnd(200 + i) * 20, bh = 40 + doodleRnd(240 + i) * 120;
        ctx.fillRect(px, base - bh, bw, bh + 160);
        px += bw + 2 + doodleRnd(280 + i) * 6; i++;
      }
    }
    // Plan PROCHE : les tours, plus les passerelles qui en relient deux voisines.
    const offN = doodleParallax(climb, 0.13, 230);
    for (let base = offN - 230; base < H + 230; base += 230) {
      let px = -12, i = 0, prev = null;
      while (px < W) {
        const bw = 26 + doodleRnd(400 + i) * 22, bh = 70 + doodleRnd(440 + i) * 120;
        const cur = tower(px, base, bw, bh, 400 + i, true);
        // Passerelle : seulement entre deux tours proches, et à une hauteur commune aux deux.
        if (prev && cur.cx - prev.cx < 96 && doodleRnd(480 + i) > 0.45) {
          const by = base - 26 - doodleRnd(500 + i) * 44;
          if (by > prev.top + 6 && by > cur.top + 6) {
            ctx.fillStyle = '#1a1030'; ctx.fillRect(prev.cx, by, cur.cx - prev.cx, 5);
            ctx.save();
            ctx.globalAlpha = Math.min(1, a) * 0.7;
            ctx.fillStyle = prev.col; ctx.fillRect(prev.cx, by, cur.cx - prev.cx, 1.2);
            ctx.restore();
          }
        }
        prev = cur;
        px += bw + 3 + doodleRnd(520 + i) * 10; i++;
      }
      // Brume au pied des tours : elle assied la rangée et masque la coupure entre deux bandes.
      const hg = ctx.createLinearGradient(0, base - 26, 0, base + 22);
      hg.addColorStop(0, 'rgba(120,40,140,0)'); hg.addColorStop(1, 'rgba(150,50,160,0.34)');
      ctx.fillStyle = hg; ctx.fillRect(0, base - 26, W, 48);
    }
    // Véhicules volants : un trait lumineux et sa traînée, à deux profondeurs. ⚠ Ils passent
    // DEVANT les tours : c'est ce qui donne l'échelle de la ville.
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const dir = i % 2 ? 1 : -1;
      const px = ((doodleRnd(600 + i) * W + climb * (0.5 + doodleRnd(610 + i) * 0.8) * dir) % (W + 90) + W + 90) % (W + 90) - 45;
      const py = doodleParallax(climb, 0.22 + doodleRnd(620 + i) * 0.3, H + 120, doodleRnd(630 + i) * H);
      const col = neons[i % neons.length];
      const gr = ctx.createLinearGradient(px, py, px - dir * 26, py);
      gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = Math.min(1, a) * 0.8;
      ctx.fillStyle = gr; ctx.fillRect(Math.min(px, px - dir * 26), py - 1, 26, 2);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
    ctx.restore();
    ctx.globalAlpha = Math.min(1, a);
    // Pluie : des traits fins EN BIAIS, à parallaxe rapide. ⚠ Des gouttes rondes se seraient
    // confondues avec les étoiles du Cosmos — c'est l'obliquité qui dit « il pleut ».
    ctx.save();
    ctx.strokeStyle = 'rgba(190,220,255,0.42)'; ctx.lineWidth = 1;
    for (let i = 0; i < 34; i++) {
      const px = (doodleRnd(i + 500) * W + climb * 0.3) % W;
      const py = doodleParallax(climb, 1.1 + doodleRnd(i + 505) * 0.7, H + 30, doodleRnd(i + 510) * H);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 3, py + 11); ctx.stroke();
    }
    ctx.restore();
  } else if (k === 'nuages') {
    // ☁️ 11.5.5 — DÉCOR DU BIOME CIEL (demande utilisateur) : c'était le seul biome
    // resté sur la page de carnet nue. Tout se passe EN L'AIR, donc aucune crête au sol :
    // deux bancs de cumulus à des parallaxes différentes, un soleil fixe et ses rayons, des
    // oiseaux qui traversent et les plumes des anges qui tombent.
    // ⚠ Les cumulus sont des TOUCHES SÉPARÉES et non une crête continue (`doodleRidge`) :
    // une bande pleine aurait fermé le ciel et noyé les dalles, alors que le sujet du biome
    // est justement le vide entre les nuages.
    // ⚠ Le blanc reste cantonné aux nuages, l'azur tient le reste : un écran uniformément
    // clair aurait fait disparaître les plateformes vertes claires à contre-jour.
    const puff = (cx, cy, w, h, fill, shade) => {
      const blob = (oy, sw, sh) => {
        ctx.beginPath();
        ctx.ellipse(cx, cy + oy, sw * 0.5, sh * 0.5, 0, 0, Math.PI * 2);
        ctx.ellipse(cx - sw * 0.26, cy + oy + sh * 0.14, sw * 0.24, sh * 0.36, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + sw * 0.25, cy + oy + sh * 0.12, sw * 0.25, sh * 0.38, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + sw * 0.04, cy + oy - sh * 0.28, sw * 0.32, sh * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
      };
      // Le dessous d'abord, légèrement décalé vers le bas : c'est cette ombre qui donne du
      // volume au nuage, un aplat blanc seul se lisait comme un trou dans le ciel.
      if (shade) { ctx.fillStyle = shade; blob(h * 0.28, w * 0.86, h * 0.92); }
      ctx.fillStyle = fill; blob(0, w, h);
    };
    // Soleil FIXE (il est à l'infini, il ne défile pas) : halo, rayons qui tournent très
    // lentement avec la montée, puis le disque.
    const sx = W - 68, sy = 76;
    ctx.save();
    const sg = ctx.createRadialGradient(sx, sy, 6, sx, sy, 110);
    sg.addColorStop(0, 'rgba(255,246,198,0.80)'); sg.addColorStop(1, 'rgba(255,246,198,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    ctx.translate(sx, sy); ctx.rotate(climb * 0.0009);
    ctx.globalAlpha = Math.min(1, a) * 0.22; ctx.fillStyle = '#fff8d0';
    for (let i = 0; i < 10; i++) {
      ctx.rotate(Math.PI * 2 / 10);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(150, -14); ctx.lineTo(150, 14); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#fff8d6'; ctx.beginPath(); ctx.arc(sx, sy, 25, 0, Math.PI * 2); ctx.fill();
    // Banc LOINTAIN : de larges cumulus pâles, sans ombre — ils ne servent qu'à creuser la
    // profondeur, les détailler aurait concurrencé le banc proche.
    const offFar = doodleParallax(climb, 0.06, 260);
    ctx.save(); ctx.globalAlpha = Math.min(1, a) * 0.75;
    for (let base = offFar - 260; base < H + 260; base += 260) {
      for (let i = 0; i < 4; i++) {
        const cx = ((doodleRnd(i + 210) * W + climb * 0.03) % (W + 120) + W + 120) % (W + 120) - 60;
        puff(cx, base - doodleRnd(i + 215) * 260, 84 + doodleRnd(i + 220) * 54, 26 + doodleRnd(i + 225) * 14, sc.far, null);
      }
    }
    ctx.restore();
    // Banc PROCHE : cumulus blancs à dessous bleuté, qui dérivent doucement sur le côté.
    const offN = doodleParallax(climb, 0.15, 200);
    for (let base = offN - 200; base < H + 200; base += 200) {
      for (let i = 0; i < 3; i++) {
        const cx = ((doodleRnd(i + 240) * W + climb * 0.06 * (i % 2 ? 1 : -1)) % (W + 160) + W + 160) % (W + 160) - 80;
        puff(cx, base - doodleRnd(i + 245) * 200, 96 + doodleRnd(i + 250) * 58, 32 + doodleRnd(i + 255) * 16, sc.near, 'rgba(126,168,214,0.42)');
      }
    }
    // Oiseaux : deux coups d'aile en silhouette, qui battent à des phases différentes.
    ctx.strokeStyle = 'rgba(30,62,104,0.42)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const dir = i % 2 ? 1 : -1;
      const px = ((doodleRnd(i + 300) * W + climb * 0.26 * (0.5 + doodleRnd(i + 305)) * dir) % (W + 40) + W + 40) % (W + 40) - 20;
      const py = doodleParallax(climb, 0.3 + doodleRnd(i + 310) * 0.3, H + 60, doodleRnd(i + 315) * H);
      const fl = Math.sin(climb * 0.06 + i * 1.7) * 3;
      ctx.beginPath();
      ctx.moveTo(px - 7, py + fl); ctx.quadraticCurveTo(px - 3, py - 3, px, py);
      ctx.quadraticCurveTo(px + 3, py - 3, px + 7, py + fl); ctx.stroke();
    }
    // Plumes : elles TOMBENT (parallaxe rapide, comme la neige du Glacier) mais en tournoyant,
    // et leur rachis les distingue d'un flocon.
    for (let i = 0; i < 12; i++) {
      const px = (doodleRnd(i + 400) * W + Math.sin(climb * 0.02 + i) * 14 + W) % W;
      const py = doodleParallax(climb, 0.5 + doodleRnd(i + 405) * 0.4, H + 40, doodleRnd(i + 410) * H);
      ctx.save();
      ctx.translate(px, py); ctx.rotate(Math.sin(climb * 0.02 + i * 2) * 0.8);
      ctx.globalAlpha = Math.min(1, a) * (0.35 + doodleRnd(i + 415) * 0.45);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(0, 0, 2.2, 5.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(110,150,196,0.65)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0, -5.6); ctx.lineTo(0, 5.6); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}
// Fond complet. Le PAPIER est la base et reste seul visible avant le 1er palier ; au-delà, le
// décor du biome courant le recouvre, fondu vers celui du palier suivant sur les
// D_BIOME_FADE derniers points — exactement la même fenêtre que les couleurs.
// ⚠ Les lignes de carnet sont conservées PAR-DESSUS le décor, en filigrane : elles sont depuis
// toujours le repère de défilement du jeu, les supprimer aurait rendu la montée moins lisible.
function doodleBg(ctx, W, H, climb, biome, s) {
  const b = biome || D_BIOMES[0];
  ctx.fillStyle = b.paper; ctx.fillRect(0, 0, W, H);                 // papier teinté par le biome
  let scened = 0;
  if (s && !doodleClassic(s)) {                                      // 🎮 Classique : le carnet d'origine, jamais de décor
    const tier = doodleTier(s.score), reste = (tier + 1) * D_BIOME_STEP - s.score;
    const f = reste > D_BIOME_FADE ? 0 : Math.max(0, Math.min(1, 1 - reste / D_BIOME_FADE));
    const cur = D_BIOMES[doodleBiomeAt(s, tier)], nxt = D_BIOMES[doodleBiomeAt(s, tier + 1)];
    doodleScene(ctx, W, H, climb, cur.k, 1 - f);
    doodleScene(ctx, W, H, climb, nxt.k, f);
    scened = (D_SCENE[cur.k] ? 1 - f : 0) + (D_SCENE[nxt.k] ? f : 0);
  }
  ctx.save();
  ctx.globalAlpha = 1 - scened * 0.78;                               // filigrane dès qu'un décor est là
  ctx.strokeStyle = b.rule; ctx.lineWidth = 1;
  const sp = 28, off = ((climb % sp) + sp) % sp;
  ctx.beginPath(); for (let y = off; y < H; y += sp) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke();
  ctx.strokeStyle = b.marge; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(26, H); ctx.stroke();
  ctx.restore();
}
function doodleSpring(ctx, cx, py) {
  ctx.strokeStyle = '#b9bec6'; ctx.lineWidth = 2;
  ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(cx - 5, py - 3 - i * 4); ctx.lineTo(cx + 5, py - 5 - i * 4); } ctx.stroke();
  ctx.fillStyle = '#e0e4ea'; ctx.fillRect(cx - 6, py - 16, 12, 3);
}
function doodleTrampoline(ctx, cx, py) {
  ctx.fillStyle = '#2f6fd0'; ctx.beginPath(); ctx.ellipse(cx, py - 3, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1b4c96'; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(cx - 14, py - 1); ctx.lineTo(cx - 11, py + 8); ctx.moveTo(cx + 14, py - 1); ctx.lineTo(cx + 11, py + 8); ctx.stroke();
}
// ⚠ 9.1.6 — DALLE MULTICOLORE (demande utilisateur) : on rebondit dessus normalement, puis
// elle DISPARAÎT de sa place et RÉAPPARAÎT plus haut. Elle tient 3 à 5 passages, après quoi
// elle s'évapore pour de bon. C'est une échelle mobile : on peut la suivre… si on la rattrape.
// ⚠ 9.2.5 — PROBABILITÉ ENCORE DIVISÉE (demande utilisateur) : /6 avant D_RAINBOW_SCORE
// points, /4 au-delà. Elle reste la part HAUTE du tirage de type (voir doodleSpawnRow) :
// RÉTRÉCIR cette bande ne touche AUCUN seuil historique (break/blue/white, tous sous 0,48)
// ni la bande des tuiles débloquées (sous 0,65) — le tirage libéré retombe en plateforme verte.
// ⚠ 9.2.5 — « ACCALMIE » : tant qu'une multicolore est EN VIE, le reste s'efface (demande
// utilisateur : « il doit quasiment n'y en avoir aucune autre »). Deux leviers combinés, tous
// deux plafonnés pour que la montée reste JOUABLE : les tuiles spéciales et les dangers
// tombent de moitié (le tirage libéré redevient une verte ordinaire) et les rangées s'espacent
// jusqu'à D_GAP_SAFE — jamais au-delà, sinon on déclencherait la dalle blanche + son monstre
// d'escorte, soit exactement le contraire de l'effet recherché.
const D_RAINBOW_BASE = 0.055;                     // probabilité d'origine, gardée comme référence
const D_RAINBOW_P = D_RAINBOW_BASE / 6;           // avant D_RAINBOW_SCORE points (≈ 0,9 %)
const D_RAINBOW_P_HI = D_RAINBOW_BASE / 4;        // à partir de D_RAINBOW_SCORE points (≈ 1,4 %, sans revenir au niveau d'origine)
const D_RAINBOW_SCORE = 1000;                     // seuil de bascule (même repère que D_PERK_STEP, 1er palier de bonus/tuiles)
const D_RAINBOW_MIN = 3, D_RAINBOW_MAX = 5;       // nombre de réapparitions, bornes incluses
const D_RAINBOW_UP = [72, 40];                    // saut vers le haut : 72 à 112 px (< D_GAP_MAX, donc toujours rattrapable)
const D_RAINBOW_SIDE = 108;                       // écart horizontal maximal : elle reste « pas loin »
const D_RAINBOW_CALM = 0.5;                       // accalmie : −50 % sur les tuiles spéciales ET les dangers
const D_RAINBOW_CALM_GAP = 1.8;                   // accalmie : rangées espacées ×1,8, PLAFONNÉES à D_GAP_SAFE
const D_RAINBOW_PAD = 10;                         // marge libre exigée autour d'elle à la réapparition
const D_RAINBOW_TRIES = 14;                       // tentatives de placement avant d'évincer ce qui gêne
const D_RAINBOW_COLS = ['#e6484d', '#f0913c', '#f2d64b', '#63c45a', '#4aa8e8', '#9b6fe0'];
function doodleRainbowPlat(ctx, p) {
  const n = D_RAINBOW_COLS.length, bw = p.w / n;
  ctx.save();
  doodleRR(ctx, p.x, p.y, p.w, p.h, 6, D_RAINBOW_COLS[0]); ctx.clip();
  for (let i = 0; i < n; i++) { ctx.fillStyle = D_RAINBOW_COLS[i]; ctx.fillRect(p.x + i * bw, p.y, bw + 1, p.h); }
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(p.x, p.y + p.h - 4, p.w, 4);
  ctx.restore();
  // ⚠ pastilles = passages RESTANTS : sans elles, impossible de savoir si la dalle va encore
  // resservir ou disparaître au prochain rebond.
  const u = p.uses || 0, cx = p.x + p.w / 2;
  ctx.fillStyle = '#fff';
  for (let i = 0; i < u; i++) { ctx.beginPath(); ctx.arc(cx + (i - (u - 1) / 2) * 8, p.y + 4.5, 2.1, 0, Math.PI * 2); ctx.fill(); }
}
// Y a-t-il une multicolore en vie ? Pilote l'accalmie (voir D_RAINBOW_CALM). Relu à chaque
// rangée plutôt que mémorisé dans `s` : aucun compteur à tenir à jour, donc rien à désynchroniser
// quand elle meurt d'usure, explose avec une bombe ou sort par le bas de l'écran.
function doodleRainbowAlive(s) {
  for (const q of s.platforms) if (q.type === 'rainbow' && !q.dead) return true;
  return false;
}
// ⚠ 9.2.5 — Emplacement LIBRE ? La dalle se téléporte : sans ce test elle réapparaissait
// SUR une autre plateforme (demande utilisateur). On exige aussi une marge face aux monstres
// et aux trous noirs — une dalle qu'on est censé suivre ne doit jamais mener dans un piège.
function doodleRainbowFree(s, p, x, y) {
  const g = D_RAINBOW_PAD;
  for (const q of s.platforms) {
    if (q === p || q.dead) continue;
    if (x < q.x + q.w + g && x + p.w + g > q.x && y < q.y + q.h + g && y + p.h + g > q.y) return false;
  }
  for (const m of s.monsters) {
    if (!m.alive) continue;
    if (x < m.x + m.w && x + p.w > m.x && y < m.y + m.h + g && y + p.h + g > m.y) return false;
  }
  for (const h of s.holes) if (Math.hypot(x + p.w / 2 - h.x, y + p.h / 2 - h.y) < h.r + g) return false;
  return true;
}
// Déplacement de la dalle après un rebond. ⚠ Le nouvel écart vertical reste sous D_GAP_MAX
// (portée d'un saut) et le décalage horizontal est BORNÉ : une dalle qui réapparaîtrait
// n'importe où serait un bonus qu'on ne peut pas suivre, donc décoratif.
function doodleRainbowHop(s, p) {
  for (let k = 0; k < 10; k++) s.parts.push({ x: p.x + Math.random() * p.w, y: p.y + Math.random() * p.h, vx: (Math.random() - 0.5) * 3, vy: -1 - Math.random() * 2, life: 24, max: 24, sz: 3, c: D_RAINBOW_COLS[k % D_RAINBOW_COLS.length] });
  p.uses--;
  if (p.uses <= 0) { p.dead = true; return; }
  // On tire des emplacements jusqu'à en trouver un LIBRE (aucune superposition).
  let nx = p.x, ny = p.y - D_RAINBOW_UP[0], placed = false;
  for (let k = 0; k < D_RAINBOW_TRIES && !placed; k++) {
    const cy = p.y - (D_RAINBOW_UP[0] + Math.random() * D_RAINBOW_UP[1]);
    const cx = Math.max(6, Math.min(DOODLE_W - p.w - 6, p.x + (Math.random() * 2 - 1) * D_RAINBOW_SIDE));
    nx = cx; ny = cy;                                     // ⚠ retenu même en cas d'échec : le repli ci-dessous part du DERNIER candidat, jamais de la place qu'elle quitte
    if (doodleRainbowFree(s, p, cx, cy)) placed = true;
  }
  // Aucun emplacement libre (rangées serrées) : plutôt que de se superposer, elle PREND la
  // place — tout ce qu'elle recouvre s'efface. La voie reste ouverte puisqu'elle occupe
  // désormais cet emplacement, et surtout elle ne peut JAMAIS réapparaître sur un monstre ou
  // un trou : on la donne à suivre, la suivre ne doit pas pouvoir tuer.
  if (!placed) {
    for (const q of s.platforms) {
      if (q === p || q.dead) continue;
      if (nx < q.x + q.w && nx + p.w > q.x && ny < q.y + q.h + D_RAINBOW_PAD && ny + p.h + D_RAINBOW_PAD > q.y) q.dead = true;
    }
    for (const m of s.monsters) {
      if (m.alive && nx < m.x + m.w && nx + p.w > m.x && ny < m.y + m.h + D_RAINBOW_PAD && ny + p.h + D_RAINBOW_PAD > m.y) m.alive = false;
    }
    s.holes = s.holes.filter(h => Math.hypot(nx + p.w / 2 - h.x, ny + p.h / 2 - h.y) >= h.r + D_RAINBOW_PAD);
  }
  p.x = nx; p.y = ny;
  // Gerbe d'arrivée : elle se téléporte, il faut pouvoir la retrouver du regard.
  for (let k = 0; k < 6; k++) s.parts.push({ x: p.x + Math.random() * p.w, y: p.y + p.h / 2, vx: (Math.random() - 0.5) * 2, vy: 0.6 + Math.random(), life: 20, max: 20, sz: 2.5, c: D_RAINBOW_COLS[k % D_RAINBOW_COLS.length] });
}
// ⚠ 9.1.7 — BONUS PERMANENTS TOUS LES 1000 POINTS (demande utilisateur) : un bloc apparaît
// à chaque palier ; le ramasser accorde UN des 5 bonus AU HASARD, et ils se CUMULENT (un
// même bonus pris deux fois compte pour 2 niveaux).
const D_PERK_STEP = 1000;
// ⚠ 9.6.8 — UNE TUILE TOUS LES 500 POINTS (demande utilisateur), et non plus 1000. La cadence
// des tuiles est donc DÉCOUPLÉE de celle des bonus permanents, restée à 1000 : les deux
// partageaient jusqu'ici le même compteur, si bien qu'accélérer l'une doublait l'autre.
const D_TILE_STEP = 500;
const D_PERKS = [
  { k: 'jump',    icon: '🦵', label: 'Ressort',  txt: 'saut plus haut' },
  { k: 'magnet',  icon: '🧲', label: 'Aimant',   txt: 'attire les bonus ET les coffres' },
  { k: 'armor',   icon: '🛡️', label: 'Carapace', txt: 'encaisse un coup' },
  { k: 'gun',     icon: '🔫', label: 'Canon',    txt: 'tir triple' },
  { k: 'feather', icon: '🪶', label: 'Plume',    txt: 'chute plus douce' },
];
const D_PERK_JUMP = 0.08;                            // +8 % de HAUTEUR de saut par niveau
const D_PERK_MAGNET_R = 46, D_PERK_MAGNET_V = 1.9;   // rayon d'attraction par niveau
const D_PERK_FEATHER = 0.10, D_PERK_FEATHER_MAX = 0.4;
const D_TOAST_LIFE = 130;
function doodlePerkBlank() { const o = {}; for (const p of D_PERKS) o[p.k] = 0; return o; }
// 🔃 Réutilise `mrev`, l'inversion du malus 🌀 Vertige : elle est déjà appliquée au doigt
// (dans `steer`) ET au clavier, et elle a déjà sa pastille de décompte dans le HUD. En
// recréer une seconde, c'était garantir d'en oublier la moitié des points d'usage.
// ⚠ 9.8.8 — 5 SECONDES tout rond (demande utilisateur) : 300 frames à 60 fps, contre 240 (4 s)
// auparavant. Le libellé de la tuile annonce la durée, il est donc DÉRIVÉ de la constante —
// recopier « 5 secondes » à la main, c'est garantir qu'un réglage futur fasse mentir la règle.
const D_INVERT_LIFE = 300;
// ⚠ 9.1.8 — TUILES DÉBLOQUÉES UNE PAR PALIER DE D_TILE_STEP POINTS, AU HASARD ET CUMULATIVES
// (demande utilisateur). Avant le premier palier, le jeu est EXACTEMENT celui d'avant.
// 🪐 10.1.6 — GRAVITÉ (demande utilisateur) : le miroir exact du 🦘 Rebond — la hauteur de saut
// est DIVISÉE par deux, donc la vitesse par √2. ⚠ Effet À DURÉE et non permanent : un malus de
// saut définitif aurait fini par rendre une rangée infranchissable pour le reste de la partie,
// alors que toutes les autres tuiles punitives du jeu s'épuisent (🔃 Inversion, ❄️ Gel, 🏜️ Sable).
// ⚠ Le facteur s'applique APRÈS le plancher des autres bonus, sur `bv` : c'est un multiplicateur
// de la hauteur finale, exactement comme 🪨 Plomb.
// ⚠ 73 px de saut, c'est SOUS l'écart confortable entre deux rangées (D_GAP_SAFE = 92) : la
// montée est donc réellement bloquée pendant l'effet — mais jamais définitivement, parce que
// retomber sur la MÊME dalle relance D_BOUNCE_BOOST (+40 % de hauteur par rebond consécutif).
// Deux rebonds sur place suffisent à repasser au-dessus de D_GAP_MAX. C'est ce qui fait de la
// dalle une épreuve de patience et non un cul-de-sac.
const D_GRAVITY_LIFE = 600, D_GRAVITY_MUL = 1 / Math.SQRT2;
// ⚠ Déclarées AVANT D_TILES, dont la règle affichée lit la durée : une const module-level
// lue plus haut serait une TDZ, c'est-à-dire un écran noir.
// 🕳️ 10.1.7 — TROU NOIR (demande utilisateur) : la dalle fait APPARAÎTRE un trou noir, et
// chaque nouveau passage dessus DOUBLE son volume.
// ⚠ « Double de volume » est lu comme un doublement de la SURFACE visible (rayon × √2) : sur un
// disque dessiné à l'écran, c'est la seule lecture qui se voie. Doubler le rayon aurait
// quadruplé la surface (22 → 176 px en trois passages, la moitié de la largeur du plateau) ;
// un doublement de volume au sens sphérique (rayon × ∛2) aurait été presque invisible.
// ⚠ Il naît AU-DESSUS de l'avatar mais HORS de l'écran : son bord bas est à D_BHOLE_ABOVE
// au-dessus du haut du plateau, donc on ne le découvre qu'après avoir grimpé d'autant.
// ⚠ Et JAMAIS sur une dalle : l'abscisse est cherchée parmi plusieurs candidats autour du
// doodler, et on ne garde que celle qui ne recouvre aucune plateforme.
const D_BHOLE_R0 = 22, D_BHOLE_ABOVE = 50, D_BHOLE_GROW = Math.SQRT2, D_BHOLE_RMAX = 88, D_BHOLE_PAD = 10;
// Pose le trou noir de la dalle `p` : au-dessus du doodler, hors écran, et sur une abscisse
// libre de toute plateforme. Renvoie le trou créé (ou null si tout est encombré).
function doodleBHoleSpawn(s, W) {
  const y = -D_BHOLE_ABOVE - D_BHOLE_R0;
  const busy = x => s.platforms.some(q => q.y > y - D_BHOLE_R0 - D_BHOLE_PAD && q.y < y + D_BHOLE_R0 + D_BHOLE_PAD
                                          && x + D_BHOLE_R0 + D_BHOLE_PAD > q.x && x - D_BHOLE_R0 - D_BHOLE_PAD < q.x + q.w);
  const clamp = x => Math.max(D_BHOLE_R0, Math.min(W - D_BHOLE_R0, x));
  // Candidats : d'abord juste au-dessus du doodler, puis de part et d'autre en s'écartant.
  for (const dx of [0, -34, 34, -68, 68, -102, 102, -136, 136]) {
    const x = clamp(s.px + dx);
    if (!busy(x)) { const h = { x, y, r: D_BHOLE_R0 }; s.holes.push(h); return h; }
  }
  return null;
}
// 🪙 Plancher du gain de la 🪙 Quitte ou double. ⚠ Déclaré AVANT D_TILES : la règle affichée
// de la tuile le lit, et une const module-level lue plus haut serait une TDZ (écran noir).
const D_GAMBLE_MIN = 2;
// 💧 10.2.0 — EAU (demande utilisateur) : la dalle laisse tomber DEUX filets, un par bord, qui
// ruissellent sur les dalles qu'ils touchent — lesquelles en relancent deux à leur tour.
// ⚠ Le réseau est RECALCULÉ à chaque frame depuis la disposition courante (`doodleWaterFlows`)
// et jamais mémorisé sur la dalle : les plateformes bougent (bleues, ascenseurs, randomiseur),
// un réseau figé aurait fait couler l'eau à côté de son support au bout de deux secondes.
// ⚠ D_WATER_MAX plafonne les dalles MOUILLÉES, pas la profondeur : sans lui, une colonne de
// dalles alignées aurait rempli l'écran de rideaux d'eau.
// ⚠ Pris dans un filet, on ne meurt pas et on ne rebondit pas : on descend à D_WATER_FALL,
// c'est-à-dire dix fois moins vite qu'une chute libre plafonnée (D_VMAX). Se poser sur une
// dalle rend la main — c'est la seule sortie, et elle vient toute seule.
const D_WATER_MAX = 3, D_WATER_W = 7, D_WATER_HIT = 9, D_WATER_FALL = 1.25, D_WATER_PULL = 0.4, D_WATER_POOL = 100, D_WATER_GRAB = 6;
// 🧼 10.2.1 — SAVON (demande utilisateur) : on glisse pendant 2 s APRÈS la dalle, dans la
// direction inverse de celle d'où l'on arrive.
// ⚠ « Le côté où on arrive » est lu comme le SENS DE MARCHE au moment de se poser : arriver en
// filant vers la droite renvoie vers la gauche. C'est le geste de la peau de banane, et c'est
// la seule lecture qui se sente — la moitié de dalle touchée, elle, ne se voit pas au doigt.
// ⚠ Repli sur `s.face` pour une arrivée strictement verticale : sans lui, tomber tout droit
// sur la dalle n'aurait rien produit du tout et l'effet aurait paru capricieux.
// ⚠ RÉUTILISE la dérive du ➡️ Tapis roulant (`beltVx`/`beltLeft`) plutôt que d'inventer un
// second mécanisme : elle porte déjà le décompte en temps réel, l'adhérence réduite, la
// poussière à contre-sens et la pastille du HUD. `beltSoap` ne sert qu'à changer l'icône.
const D_SOAP_LIFE = 120, D_SOAP_V = 2.6;
// 🪷 10.2.2 — ORIGAMI (demande utilisateur) : elle se plie et se déplie en TROIS formes qui se
// succèdent — dalle ordinaire, dalle à super saut, dalle qu'on traverse.
// ⚠ La forme courante est CALCULÉE une fois par frame dans la boucle et rangée dans `p.ori` :
// le dessin et la solidité la relisent là. Deux calculs séparés (l'un sur l'horloge du monde,
// l'autre sur celle du rendu), c'était la garantie qu'on traverse une dalle dessinée pleine.
// ⚠ Phase propre à chaque dalle, comme les tuiles à cycle : sans elle, tous les origamis de
// l'écran se plieraient à l'unisson et une rangée entière deviendrait traversante d'un coup.
// 🍯 10.2.3 — COLLANTE (demande utilisateur) : on y reste collé 3 s avant de repartir.
// ⚠ RÉUTILISE la retenue du 🪗 Accordéon (`s.acc`) : c'est le seul état du jeu où l'on n'est ni
// en saut, ni en chute, ni en vol, et il porte déjà la sortie de secours (dalle morte ou sortie
// par le bas). En inventer un second, c'était garantir d'oublier cette porte quelque part.
// ⚠ `mul` distingue les deux : l'accordéon DÉTEND (×1,75), la colle relâche à saut normal (×1).
const D_STICKY_HOLD = 180;
// 🍿 10.2.4 — POP-CORN (demande utilisateur) : elle éclate au contact et la HAUTEUR du saut est
// tirée au sort, un peu au-dessus ou un peu en dessous de la normale.
// ⚠ Le tirage porte sur la hauteur, la vitesse en prend donc la RACINE (h ∝ v²) : appliquer
// ±15 % directement à la vitesse aurait fait ±32 % de hauteur, ce qui n'est plus « un petit peu ».
// ⚠ Elle ne meurt pas en éclatant : c'est une dalle à hasard, pas une dalle à usage unique.
const D_POP_LO = 0.85, D_POP_HI = 1.15, D_POP_LIFE = 26;
// 🍿 12.5.1 — LA BARQUETTE TIRE (demande utilisateur) : D_POP_THROW grains partent en gerbe au
// premier rebond, vers le HAUT ou vers le BAS de la dalle à pile ou face, et ce sont de VRAIS
// PROJECTILES — ils tuent les créatures qu'ils touchent.
// ⚠ Ils TRAVERSENT ce qu'ils tuent : aucun `break` après la mise à mort, un même grain peut
// donc faucher toute une colonne dans la même frame. C'est ce qui les distingue d'une balle,
// dont le perforant se compte et s'épuise.
// ⚠ Ils ne s'éteignent PAS au bout d'un temps : ils volent jusqu'à SORTIR DE L'ÉCRAN, d'où une
// gravité bien plus douce que celle des particules (D_POP_SHOT_G contre 0,25) — le grain monte,
// s'incurve et s'en va, au lieu de retomber au pied de la dalle.
// ⚠ UNE SEULE GERBE PAR DALLE (`p.thrown`) : une volée à chaque passage aurait rempli l'écran
// de tirs gratuits, et c'est la première bouchée qui saute — les suivantes, la barquette les a
// déjà lâchées.
// ⚠ Tableau À EUX (`s.pops`) et non `s.bullets` : la chaîne des balles CONSOMME le projectile
// à trois endroits (le 🥚 tamagotchi l'avale, la 🧊 stalactite le brise, le boss l'encaisse), ce
// qui aurait contredit « il traverse » ; et un grain de maïs n'a ni perforant, ni explosives, ni
// gros calibre à hériter. Les deux gardes qui comptent, elles, sont REPRISES telles quelles :
// le pavois du 🛡️ Réflecteur (`doodleShieldBounce`) et l'encaissement du 🐉 dragonneau / 🏗️
// bâtisseur (`doodleStrike`) — les recopier autrement, c'était créer un second jeu de règles.
// ⚠ La mise à mort passe par `doodleKillMonster`, le point de passage unique : le coffre tombe,
// les quêtes de chasse comptent, exactement comme pour une balle.
// ⚠ L'animation d'éclatement de la barquette (`p.pop`) est CONSERVÉE : la gerbe s'y ajoute.
const D_POP_THROW = 4, D_POP_THROW_V = 3.6, D_POP_SHOT_R = 5.4, D_POP_SHOT_G = 0.055;
// 🧱 10.2.5 — PÂTE À MODELER (demande utilisateur) : elle S'ENFONCE un peu à chaque rebond.
// ⚠ Le pas est petit devant l'écart entre deux rangées (D_GAP_SAFE = 92) : la dalle se dérobe
// sous les pieds sans jamais ouvrir d'un coup un trou infranchissable. ⚠ Aucun plafond : elle
// finit par sortir par le bas et le nettoyage ordinaire des plateformes s'en charge — c'est
// exactement ce que « à chaque saut » demande.
const D_CLAY_SINK = 8;
// 🫧 10.2.6 — BULLE (demande utilisateur) : on finit ENFERMÉ dans une bulle qui monte, puis elle
// éclate et rend un saut ordinaire. ⚠ RÉUTILISE `fly`/`flyType`, comme le 🎈 Ballon : la
// traversée des monstres et des trous noirs (le « bouclier » demandé) et l'invulnérabilité de 2 s
// à la retombée viennent avec, sans un seul test de plus ailleurs dans la boucle.
// ⚠ Elle monte LENTEMENT — c'est une bulle, elle flotte ; plus vite, elle aurait fait doublon
// avec le chapeau à hélice.
// ⚠ Tirer la fait éclater SUR-LE-CHAMP (demande utilisateur) : c'est la porte de sortie, sinon
// on subirait la montée sans aucun moyen de l'interrompre.
const D_BUBBLE_LIFE = 105, D_BUBBLE_VY = -2.6;
// 🥚 10.2.7 — TAMAGOTCHI (demande utilisateur) : elle a un APPÉTIT de D_TAMA_MEALS balles et
// chaque repas la change. Affamée (0) elle n'est pas solide, on la traverse ; repue (1) elle est
// heureuse et REND UN SUPER SAUT ; rassasiée (2) elle jaunit, fin d'appétit, et redevient une
// dalle ordinaire ; gavée (3) elle vire au rouge et TIRE sur le doodler.
// ⚠ DEUX champs et non un compteur seul : `p.tama` (false = affamée, true = nourrie) reste le
// seul état que lit `doodleSolid` — une dalle non solide se traverse aussi pour les coffres et
// les météorites, ce qu'un test posé au seul endroit de l'atterrissage aurait laissé passer — et
// `p.meals` compte les repas pour le reste (saut, couleur, colère).
// ⚠ Elle avale la balle AVANT le test des monstres : sans quoi une balle explosive aurait pu
// nourrir la dalle ET tuer, alors que la dalle est censée la CONSOMMER. Au-delà du 3e repas elle
// ne mange plus : la balle poursuit sa route vers ce qu'il y a derrière.
// ⚠ Le tir de la furieuse part dans `s.tshots`, le tableau des projectiles HOSTILES, comme celui
// de la 🔴 dalle laser : il porte déjà le défilement de la caméra, la boîte de collision, les
// teintes qui parent et le nettoyage hors écran. Un second tableau, c'était les oublier tous.
const D_TAMA_EAT = 20;   // frames d'animation de mastication
const D_TAMA_MEALS = 3, D_TAMA_GAP = 200, D_TAMA_TEL = 40, D_TAMA_V = 1.85;
// 🔴 10.2.8 — LASER (demande utilisateur) : la dalle TIRE sur le doodler, une fois toutes les
// 5 secondes, et le trait va « relativement lentement ».
// ⚠ D_TLASER_V est sous la moitié de la vitesse d'un tir de boss : c'est ce qui rend l'esquive
// possible en se déplaçant, et non seulement en sautant au bon moment.
// ⚠ La visée est FIGÉE au départ : un trait qui se recorrigerait ne serait pas esquivable.
// ⚠ D_TLASER_TEL frames de charge AVANT le départ, et la charge se voit (l'œil de la dalle
// grossit et s'allume) : sans annonce, un tir lent reste un tir qu'on ne voit pas venir.
// ⚠ Il BLESSE via `doodleHurt` comme tout le reste : jamais de mort sèche que rien ne pare.
// ⚠ 12.4.8 — L'ANNONCE DU TIR EST UNE VRAIE ANIMATION (demande utilisateur) : l'œil qui
// grossit ne disait ni QUAND le coup part, ni OÙ il va. La tourelle porte maintenant un CANON
// qui suit le doodler (`p.aimX`/`p.aimY`, posés par la boucle et relus par le dessin, comme le
// regard de la 👀 Vivante — deux calculs séparés auraient fini par viser deux endroits), un
// rayon de visée en pointillés qui s'allonge à mesure que la charge monte, deux anneaux qui
// convergent dans l'œil, et un flash de gueule au départ (`p.lazFire`).
// ⚠ Le rayon de visée SUIT la cible jusqu'au départ, et c'est honnête : le tir est visé à
// l'instant où il part, le trait montre donc exactement où il ira. C'est le PROJECTILE qui ne
// se recorrige pas, jamais l'annonce.
// ⚠ 🫥 Invisible / 🫒 Camouflage : `p.seen` passe à faux, le canon se fige et le rayon
// s'éteint — une tourelle qui continuerait de suivre une cible qu'elle ne voit pas mentirait
// sur la seule chose que ces deux teintes promettent.
const D_TLASER_GAP = 300, D_TLASER_TEL = 45, D_TLASER_V = 1.55, D_TLASER_R = 5, D_TLASER_FLASH = 10;
// 🍄 10.2.9 — CHAMPIGNON HALLUCINOGÈNE (demande utilisateur) : l'écran SE RETOURNE pendant 3 s.
// ⚠ C'est un retournement du DESSIN, pas des commandes : le pilotage continue de répondre en
// coordonnées de plateau, si bien que gauche et droite paraissent inversés — c'est précisément
// le vertige demandé, et il ne coûte pas un seul test dans la boucle de jeu.
// ⚠ Le HUD reste À L'ENDROIT : un compteur et un toast à l'envers ne sont plus des informations,
// et perdre la lecture de ses munitions n'était pas ce qui était demandé.
// ⚠ La bascule est PROGRESSIVE (D_SHROOM_EASE) au début comme à la fin : un retournement
// instantané fait perdre le fil de l'endroit où l'on est, ce qui n'est plus jouable du tout.
// ☠️ 10.3.1 — DESTRUCTRICE DE MONSTRES (demande utilisateur) : le rebond tue TOUT ce qui vit à
// D_SLAYER_R d'altitude de la dalle. ⚠ C'est une BANDE horizontale, pas un cercle : la demande
// porte sur l'altitude, et un rayon circulaire aurait épargné les créatures des deux bords.
// ⚠ Elle passe par `doodleKillMonster`, donc chaque victime lâche son coffre comme partout
// ailleurs — c'est ce qui en fait une récolte et pas seulement un nettoyage.
// ⚠ Répétable : la dalle défile et les créatures ne repoussent pas au même endroit ; en faire
// une dalle à usage unique n'aurait rien protégé et l'aurait rendue tiède.
// 🌁 10.3.2 — BROUILLARD (demande utilisateur) : toutes les DALLES deviennent invisibles, et
// elles réapparaissent dès qu'on en retouche une — donc pendant exactement un saut.
// ⚠ Seules les plateformes s'effacent : monstres, trous noirs, coffres et bonus restent
// visibles. Tout cacher, c'était une mort à l'aveugle et non une épreuve de mémoire.
// ⚠ L'aveuglement est LEVÉ tout en haut du bloc d'atterrissage, avant les effets de la dalle :
// c'est ce qui permet de retomber sur une dalle brouillard et de repartir pour un tour, au lieu
// de rester aveugle à jamais parce que la levée serait passée après la pose.
// 🚦 10.3.3 — FEU TRICOLORE (demande utilisateur) : vert / jaune / rouge, 2 s chacun — solide,
// glissante, puis « perd tous tes bonus ».
// ⚠ La couleur est CALCULÉE une fois par frame et rangée dans `p.lit`, comme la forme de
// l'origami : le dessin et l'effet la relisent là, sinon on finirait par se faire dépouiller
// par un feu affiché vert.
// ⚠ Le rouge efface les bonus permanents et les améliorations d'arme, PAS les boucliers ni les
// munitions — exactement la frontière du ❄️ Gel absolu : ce qu'un piège subi enlève, c'est la
// puissance, jamais la survie.
// 🪝 10.3.4 — GRAPPIN (demande utilisateur) : la dalle LANCE un grappin ; s'il touche le
// doodler, il le ramène sur elle.
// ⚠ Le grappin part vers la position du doodler FIGÉE au lancer, comme les tirs de boss : une
// tête qui se recorrigerait serait impossible à éviter, et la dalle deviendrait un aimant.
// ⚠ Portée BORNÉE (D_GRAP_REACH) et rétractation : sans elles, la corde traverserait l'écran et
// il n'existerait plus un seul endroit hors d'atteinte.
// ⚠ Traction par état exclusif (`s.grab`), comme la 🛒 Tyrolienne : pendant qu'on est ramené on
// ne saute pas, on ne tombe pas, on ne vole pas — et l'arrivée rend un saut ordinaire.
// 🦎 10.3.5 — CAMÉLÉON (demande utilisateur) : elle EMPRUNTE l'apparence d'une autre tuile et
// n'a aucun effet — c'est une plateforme verte déguisée.
// ⚠ Aucun indice à l'écran : c'est toute la tuile. Elle ne se découvre qu'en s'y posant, et le
// mensonge joue dans les deux sens (une fausse pique qu'on évite pour rien, une fausse dalle à
// super saut qui n'en donne pas).
// ⚠ Le déguisement est tiré à la NAISSANCE parmi les tuiles déjà débloquées, comme le 🃏 Casino :
// prendre l'apparence d'une tuile que le joueur n'a jamais vue n'aurait trompé personne.
// ⚠ `doodleEffType` ne la traduit PAS (contrairement au casino) : c'est ce qui garantit qu'aucun
// effet ne se déclenche, sans avoir à exclure la tuile un par un dans toute la chaîne.
// 🩹 10.3.6 — POT DE COLLE (demande utilisateur) : elle garde SA hauteur mais se déplace pour
// rester à l'aplomb du joueur.
// ⚠ Elle SUIT à vitesse bornée (D_GLUE_V) au lieu de se téléporter sous le doodler : une dalle
// collée en permanence à l'abscisse du joueur, c'est un filet de sécurité permanent, et la
// poursuite n'aurait même pas été visible.
// ⚠ Seule l'abscisse bouge : lui laisser toucher la hauteur aurait fait d'elle un ascenseur qui
// suit, c'est-à-dire une fin de partie impossible.
// ⚠ Écart pris par le PLUS COURT chemin, bords traversants compris — comme le pilotage et
// l'attraction gravitationnelle, sinon elle traverserait tout l'écran pour rejoindre un joueur
// qui vient de sortir par le bord opposé.
// ⚠ 12.4.2 — LA POURSUITE S'ARRÊTE AU PREMIER REBOND (`p.glued`, demande utilisateur) : elle
// suivait sans relâche, se retrouvait donc toujours sous les pieds au retour, et on rebondissait
// dessus indéfiniment sans jamais quitter sa hauteur. Figée après le premier passage, elle rend
// un second rebond de dalle ordinaire — celui qu'on rate si on ne s'est pas déplacé.
const D_GLUE_V = 1.6;
// 🪞 10.3.7 — MIMÉTIQUE (demande utilisateur) : elle prend l'APPARENCE ET L'EFFET de la dernière
// dalle sur laquelle le joueur a rebondi.
// ⚠ Le modèle (`s.lastTileK`) est relu à chaque frame et recopié dans `p.mim`, que
// `doodleEffType` traduit : le dessin et l'effet passent donc tous les deux par le même type
// effectif, comme pour le 🃏 Casino. La mimétique change donc D'ELLE-MÊME en cours de partie.
// ⚠ Contrairement au 🦎 Caméléon, elle n'est PAS un leurre : elle fait vraiment ce qu'elle montre.
// 👀 10.3.8 — VIVANTE (demande utilisateur) : elle a des YEUX et elle suit le joueur.
// ⚠ Elle se déplace sur LES DEUX AXES, mais BORNÉE autour de son point de naissance (comme le
// 👁 Rôdeur et le 🛗 Ascenseur) : libre, elle serait venue se coller sous le doodler et aurait
// tenu lieu de filet permanent, ou serait partie rejoindre la rangée voisine et aurait fait
// mentir l'écart entre rangées, seul garant qu'un saut reste faisable.
// ⚠ La direction du REGARD est calculée dans la boucle et rangée sur la dalle (`lookX`/`lookY`) :
// le dessin n'a pas accès à la position du doodler, et deux calculs séparés auraient fini par
// faire loucher la dalle ailleurs qu'elle ne va.
const D_ALIVE_V = 0.85, D_ALIVE_SPAN = 46;
// 🎯 10.3.9 — QUÊTE (demande utilisateur) : la dalle ouvre un défi tiré au sort ; le réussir
// fait pleuvoir des coffres (voir D_QUEST_RAIN_PER).
// ⚠ UNE SEULE quête à la fois : deux défis en cours, c'est deux compteurs dans le HUD et un
// joueur qui ne sait plus lequel il poursuit. Une dalle rencontrée pendant une quête le dit et
// ne consomme rien — elle reste utilisable plus tard.
// ⚠ Les trois compteurs sont RELATIFS à l'instant du départ (`from`) : compter en absolu aurait
// validé « 500 points de plus » à un joueur qui en était déjà à 3000.
// 🔺 10.4.0 — FRACTALE (demande utilisateur) : elle disparaît au rebond et laisse DEUX dalles à
// la même hauteur. ⚠ Les filles sont elles-mêmes des fractales — c'est ce que le nom promet —
// mais elles rétrécissent et le nombre de générations est BORNÉ : sans les deux, une seule dalle
// aurait fini par couvrir toute la rangée de 340 px de dalles minuscules, et la rangée serait
// devenue un tapis continu au lieu d'un choix.
// ⚠ La dernière génération naît VERTE : une fractale de largeur minimale qui se scinderait
// encore aurait donné des dalles plus étroites que la boîte du doodler, donc inatteignables.
// 🌳 10.6.1 — ARBRE GÉANT, L'ASCENSEUR VÉGÉTAL (demande utilisateur) : on ne rebondit plus
// dessus, on s'y PLANTE. Le doodler perd la main, un arbre pousse sous ses pieds et le soulève
// doucement jusqu'à la hauteur de la rangée suivante ; là il est relâché et le jeu reprend.
// ⚠ La montée passe par une VITESSE calculée (et non par un `s.py` posé à la main comme sur la
// 🌿 Liane) : c'est `s.vy < 0` qui déclenche le défilement de la caméra, sans quoi un arbre plus
// haut que l'écran aurait poussé le doodler hors du cadre.
// ⚠ `p.treeH` REPART DE ZÉRO à chaque prise : le doodler se pose sur la DALLE, il doit donc
// partir du sol et non du sommet de la pousse précédente.
// ⚠ La cible est la dalle SOLIDE la plus basse au-dessus (voir `doodleTreeTarget`), jamais une
// hauteur inventée : « jusqu'à ce que l'arbre touche une nouvelle tuile », et rien d'autre.
// ⚠ Garde-fou `D_TREE_RIDE_MAX` : la génération remplit toujours l'écran, mais un arbre qui
// pousserait sans cible aurait figé la partie pour de bon.
// ⚠ La détente de sortie garde la mécanique d'origine (h ∝ v², d'où l'exposant /2) : revenir
// sur le même arbre le fait repartir plus fort.
// 🕊️ 10.4.2 — MISÉRICORDIEUSE (demande utilisateur) : elle met le jeu en PAUSE, montre les
// tuiles débloquées de la partie et en laisse BANNIR une définitivement ; à la reprise, elle
// offre un bouclier.
// ⚠ La tuile bannie part de `s.tiles` ET entre dans `s.banned` : sans la seconde liste, le
// prochain palier de 500 points l'aurait tout simplement redébloquée.
// ⚠ Une seule utilisation par dalle (`p.used`), et la dalle n'est PAS consommée si la partie
// n'a encore rien débloqué — sinon la première rencontrée aurait été perdue pour rien.
// ⚠ La pause passe par le MÊME mécanisme que la 🎰 Machine à sous : on dessine la frame courante
// puis on rend la main sans reprogrammer de rAF, c'est le changement de phase qui gèle la boucle.
const D_MERCY_SHIELD = 1;
// 🕊️ Bannissement d'une tuile : elle quitte le tirage de la partie ET entre dans `s.banned`,
// sans quoi le prochain palier de 500 points la redébloquerait aussitôt.
function doodleMercyBan(s, k) {
  s.tiles = s.tiles.filter(x => x !== k);
  s.banned = s.banned || [];
  if (s.banned.indexOf(k) < 0) s.banned.push(k);
}
// Le bouclier promis par la tuile, borné au plafond de son butin dans D_LOOT. ⚠ Un seul point
// pour les DEUX sorties de la miséricordieuse (bannissement choisi à l'écran, ou retrait
// d'elle-même quand il n'y a plus rien à bannir) : dupliquer le calcul, c'était garantir qu'une
// des deux finisse par offrir un bouclier de plus que l'autre.
function doodleMercyShield(s) {
  const cap = D_LOOT.find(l => l.k === 'shHit');
  s.wpn.shHit = Math.min(cap ? cap.max : 3, (s.wpn.shHit || 0) + D_MERCY_SHIELD);
}
// 🎨 10.4.3 — INVERSEUSE DE COULEUR (demande utilisateur) : pendant 3 s, toutes les couleurs du
// jeu sont inversées.
// ⚠ L'inversion se fait en UNE opération : un rectangle blanc plein écran en composition
// `difference`, qui retourne chaque composante déjà dessinée. Repeindre chaque élément avec sa
// couleur complémentaire aurait voulu dire toucher aux cinquante fonctions de dessin du jeu.
// ⚠ Posée AVANT le HUD, comme le retournement du 🍄 Champignon : des compteurs en négatif
// restent lisibles, mais un toast et une bannière inversés ne se lisent plus du tout.
const D_NEG_LIFE = 180;
// 🥚 10.4.4 — ŒUF (demande utilisateur) : si on ne s'y est pas posé au bout de D_EGG_JUMPS
// sauts, il ÉCLÔT et lâche un monstre ; et à chaque saut, l'œuf CHANGE de place sur sa rangée.
// ⚠ Le compte à rebours est en SAUTS du joueur, pas en secondes : c'est ce qui en fait un choix
// (aller le chercher ou l'abandonner) plutôt qu'une minuterie subie.
// ⚠ Il ne se déplace que sur SA rangée, en abscisse : le laisser changer de hauteur aurait fait
// mentir l'écart entre rangées, seul garant qu'un saut reste faisable.
// ⚠ Éclos, la dalle reste une plateforme (coquille brisée) : la faire disparaître aurait ouvert
// un trou dans la rangée EN PLUS de lâcher la créature, soit une double peine.
const D_EGG_JUMPS = 5;
// 🐉 10.6.7 — LE DRAGONNEAU (demande utilisateur) : l'œuf n'éclot plus sur une créature
// ordinaire tirée au sort, mais sur SA propre bête, plus puissante que toutes celles qui
// peuplent les rangées. Trois choses l'en distinguent, et il faut les trois :
//   • il patrouille sur LES DEUX axes (`vx` + `span`/`vy2`, la mécanique du 👁 rôdeur, réutilisée
//     telle quelle : deux déplacements écrits deux fois auraient fini par diverger) ;
//   • il CRACHE un trait de feu visé, annoncé D_HATCH_TEL frames avant de partir ;
//   • il ENCAISSE D_HATCH_HP tirs là où les autres tombent au premier.
// ⚠ Les points de vie ne valent QUE pour les projectiles (ils sont décomptés dans
// `doodleStrike`, le point de passage unique des balles et des shurikens) : l'écrasement, un
// souffle, la ☠️ destructrice, le 🐏 bélier ou la foudre l'abattent d'un coup comme n'importe
// quelle créature. Un dragonneau qui survivrait à une bombe aurait fait mentir toutes ces
// tuiles à la fois.
// ⚠ Sa cadence de crachat vit sur LUI (`m.spit`) et non sur `s.t` : deux dragonneaux à l'écran
// doivent tirer chacun sur son rythme, pas à l'unisson.
// ⚠ Son trait de feu part dans `s.tshots`, avec les traits des dalles laser : c'est ce tableau
// qui porte déjà le défilement de la caméra, la cascade de boucliers et le nettoyage hors
// écran. Un second tableau, c'était trois oublis en puissance.
const D_HATCH_HP = 3, D_HATCH_GAP = 190, D_HATCH_TEL = 50, D_HATCH_V = 1.9, D_HATCH_R = 7;
const D_HATCH_VX = 1.15, D_HATCH_VY = 0.75, D_HATCH_SPAN = 46;
function doodleMakeHatchling(ny) {
  const y = ny - 44;
  return { x: 10 + Math.random() * (DOODLE_W - 72), y, y0: y, w: 52, h: 44, type: 1, alive: true,
           kind: 'hatch', rare: true, hp: D_HATCH_HP, hpMax: D_HATCH_HP, spit: D_HATCH_GAP, hurt: 0,
           vx: (Math.random() < 0.5 ? -1 : 1) * D_HATCH_VX,
           vy2: (Math.random() < 0.5 ? -1 : 1) * D_HATCH_VY, span: D_HATCH_SPAN };
}
// 🔔 10.4.5 — NOTIF (demande utilisateur) : le rebond fait apparaître une fausse notification de
// téléphone, ou la barre de volume qui descend sur le côté droit. Une seule fois par dalle.
// ⚠ Purement DÉCORATIF : rien n'est touché au jeu. C'est la seule tuile qui ne change ni la
// physique, ni les dalles, ni les créatures — et c'est exactement ce qui est demandé.
// ⚠ La carte est dessinée SOUS la ligne du HUD et jamais par-dessus : une fausse notification
// qui masquerait les munitions ferait perdre une partie pour une blague.
// 🚩 10.4.6 — DRAPEAU (demande utilisateur) : la dalle plante un mât et hisse un drapeau, tiré
// du catalogue du jeu « Find the Flag » (`FLAGS`) plutôt que redessiné — ~190 pays y sont déjà
// ramenés à une grille de pixels, en recopier ne serait-ce qu'un aurait été du travail perdu et
// une seconde source de vérité à maintenir.
// ⚠ `FLAGS` est déclaré BIEN PLUS BAS dans le fichier : il n'est donc lu qu'à l'exécution, dans
// les corps de fonction, jamais au moment où ces constantes-ci sont évaluées.
// ⚠ Purement DÉCORATIVE, comme la 🎊 Confettis : chaque rebond hisse un autre pays et le nomme,
// et c'est tout. La dalle se comporte pour le reste comme une plateforme verte.
// 🔋 10.4.8 — RECHARGE (demande utilisateur) : +5 balles à chaque passage, sans aucune limite.
// ⚠ Répétable et SANS `p.used` : « cumulable à l'infini » est explicite, et c'est le seul point
// où le jeu redonne des munitions autrement qu'en tuant. Elle ne rend donc pas les coffres
// inutiles — 5 balles contre les 25 d'un coffre — elle empêche seulement qu'une partie meure
// à sec de munitions sans qu'aucun geste puisse la rattraper.
// ⚠ `setAmmo` est appelé dans la foulée : le compteur du HUD vit dans React, pas dans `s`, et
// l'oublier aurait affiché un stock périmé jusqu'au tir suivant.
const D_RECHARGE = 5;
const D_FLAG_W = 28, D_FLAG_H = 18;
// Le drapeau porté par la dalle, en tolérant que le catalogue soit vide.
function doodleFlagOf(p) { return (typeof FLAGS !== 'undefined' && FLAGS.length) ? FLAGS[(p.flag || 0) % FLAGS.length] : null; }
const D_NOTIF_LIFE = 190, D_NOTIF_VOL_P = 0.25;
const D_NOTIFS = [
  { icon:'⚠️', ti:'Erreur 404',        bo:'La plateforme demandée est introuvable.' },
  { icon:'🔥', ti:'Plan hot près de toi', bo:'Un doodler célibataire à 12 m d\'altitude !' },
  { icon:'🪫', ti:'Batterie faible',   bo:'5 % restants. Branche-toi, ou saute plus vite.' },
  { icon:'📩', ti:'Nouveau message',   bo:'« t\'es où ? » — Maman' },
  { icon:'☁️', ti:'Stockage plein',    bo:'Impossible de sauvegarder ta chute.' },
  { icon:'🛰️', ti:'Mise à jour',       bo:'Redémarrage dans 3 s… 2 s… on rigole.' },
  { icon:'🏦', ti:'Opération refusée', bo:'Fonds insuffisants pour acheter un jetpack.' },
  { icon:'⏰', ti:'Rappel',            bo:'Tu avais dit « une dernière partie ».' },
];
const D_TREE_JUMP = 0.05, D_TREE_H0 = 9;
const D_TREE_GROW = 0.9, D_TREE_RIDE_MAX = 420;   // 🌳 px de pousse par frame (« doucement »), et le garde-fou s'il n'y a rien au-dessus
// 🌳 La rangée visée par l'arbre : la dalle SOLIDE la plus basse au-dessus de la sienne.
// ⚠ Les leurres (🎲 roulette, 🥚 tamagotchi affamé, 🪷 origami ouvert) et les dalles mortes sont
// écartés : s'arrêter sur une dalle qu'on traverse aurait relâché le doodler devant rien.
function doodleTreeTarget(s, p) {
  let best = null;
  for (const q of s.platforms) {
    if (q === p || q.dead || !doodleSolid(q) || q.y > p.y - 24) continue;
    if (best == null || q.y > best.y) best = q;
  }
  return best;
}
const D_FRACT_GEN = 3, D_FRACT_SHRINK = 0.58, D_FRACT_MINW = 24, D_FRACT_GAP = 6;
// 🎯 10.10.0 — LA QUÊTE PAIE EN PLUIE DE COFFRES (demande utilisateur) : au lieu de trois
// butins accordés d'office, elle fait TOMBER DU CIEL un coffre par tranche de D_QUEST_RAIN_PER
// points d'altitude. La récompense grandit donc avec la partie, et il faut aller la chercher :
// les coffres se posent où ils tombent, on n'a pas tous ceux qu'on a gagnés.
// ⚠ Au moins UN coffre : sous 250 points la récompense aurait été nulle, et une quête qui ne
// paie rien n'est plus une quête.
// ⚠ Ils tombent ÉTALÉS dans le temps (`D_QUEST_RAIN_EVERY`) et non d'un bloc : c'est ce qui en
// fait une pluie plutôt qu'un tas, et ce qui évite qu'à 10 000 points quarante coffres
// naissent sur la même frame. La file d'attente vit dans `s.rain`.
const D_QUEST_RAIN_PER = 250, D_QUEST_RAIN_EVERY = 7;
function doodleQuestRainN(score) { return Math.max(1, Math.floor((score || 0) / D_QUEST_RAIN_PER)); }
// 🧩 10.6.4 — « REBONDIS SUR 7 SORTES DE TUILES » remplace « rebondis sur 20 plateformes »
// (demande utilisateur) : le défi porte désormais sur la VARIÉTÉ, pas sur la quantité — 20
// rebonds tombaient tout seuls en montant, sans jamais rien changer à la façon de jouer.
// ⚠ Il compte des SORTES, pas des rebonds : la quête porte donc sa propre liste (`seen`) là
// où les deux autres se contentent d'un repère de départ (`from`) — un compteur global ne
// peut pas dire ce qui a déjà été vu.
const D_QUESTS = [
  { k:'kinds', icon:'🧩', n:7,   txt: p2 => `rebondis sur ${p2} sortes de tuiles différentes` },
  { k:'alt',   icon:'📈', n:500, txt: p2 => `grimpe de ${p2} points d'altitude` },
  { k:'kills', icon:'💀', n:5,   txt: p2 => `abats ${p2} créatures` },
];
// 🏆 10.6.4 — PLUSIEURS QUÊTES DE FRONT (demande utilisateur) : `s.quests` est une LISTE, et
// mener les TROIS en même temps rapporte cette prime, immédiatement.
// ⚠ Une dalle ne tire que parmi les défis PAS ENCORE en cours : deux exemplaires du même
// défi, c'était deux compteurs identiques dans le HUD avec deux cibles distinctes.
const D_QUEST_TRIO = 3;
// Avancement courant d'UNE quête, borné à sa cible. ⚠ Un seul endroit pour les trois : le HUD,
// le test de réussite et le libellé le relisent ici, et ne peuvent donc pas diverger.
function doodleQuestDone(s, q) {
  if (!q) return 0;
  if (q.k === 'kinds') return Math.min(q.n, (q.seen || []).length);
  if (q.k === 'alt') return Math.min(q.n, Math.max(0, s.score - q.from));
  return Math.min(q.n, s.questKills - q.from);
}
// Départ d'une quête. ⚠ Le repère est figé MAINTENANT : les compteurs de la partie courent
// déjà, et compter en absolu aurait validé « 500 points de plus » à qui en était déjà à 3000.
function doodleQuestNew(s, qd) {
  return { k: qd.k, n: qd.n, icon: qd.icon, seen: qd.k === 'kinds' ? [] : null,
           from: qd.k === 'alt' ? s.score : (s.questKills || 0) };
}
// 🏅 11.6.0 — QUÊTE ULTIME (demande utilisateur) : une fois les 3 défis RÉUSSIS (pas
// seulement ouverts), une quatrième quête s'ouvre TOUTE SEULE, et elle en demande trois fois
// plus — abattre D_ULT_KILLS créatures, rebondir sur D_ULT_KINDS sortes de tuiles et terrasser
// D_ULT_BOSS boss. Elle paie ce qu'aucune autre récompense du jeu n'offre : 100 % des tuiles
// débloquées d'un coup et toutes les améliorations portées à leur plafond.
// ⚠ UNE SEULE FOIS par partie (`s.ultDone`) : la reconduire aurait payé deux fois un cadeau
// qui, par construction, ne peut plus rien donner de neuf.
// ⚠ Ses trois compteurs sont RELATIFS à son ouverture, comme ceux des trois autres — sans quoi
// les 15 créatures auraient été acquises d'avance par les 5 de la quête de chasse.
// ⚠ Sa liste de sortes lui est PROPRE : la quête des sortes n'en a vu que 7, et repartir de sa
// liste aurait offert la moitié du défi.
const D_ULT_KILLS = 15, D_ULT_KINDS = 12, D_ULT_BOSS = 1;
// Le prix de la victoire. ⚠ Les butins SANS plafond (munitions, ✴️ shurikens, 🐏 bélier)
// n'ont pas de « max » à atteindre : ils reçoivent une dotation fixe, sinon la boucle aurait
// tourné à l'infini sur `max: Infinity`.
const D_ULT_AMMO = 99, D_ULT_STACK = 3;
// Les bonus permanents n'ont pas de plafond non plus : chacun est porté AU MOINS à ce niveau
// (celui où la 🪶 Plume atteint sa chute la plus douce, D_PERK_FEATHER_MAX).
const D_ULT_PERK = 4;
function doodleUltNew(s) {
  return { from: s.questKills || 0, seen: [], bossFrom: s.bossKills || 0 };
}
// Avancement des trois objectifs, bornés à leur cible — lus par le HUD, par le test de réussite
// et par la bannière, qui ne peuvent donc pas diverger.
function doodleUltDone(s) {
  const u = s.ultime;
  if (!u) return null;
  return { kills: Math.min(D_ULT_KILLS, (s.questKills || 0) - u.from),
           kinds: Math.min(D_ULT_KINDS, u.seen.length),
           boss: Math.min(D_ULT_BOSS, (s.bossKills || 0) - u.bossFrom) };
}
// 🏅 La récompense : toutes les tuiles et tout au plafond.
// ⚠ Les tuiles BANNIES par la 🕊️ miséricordieuse restent dehors : le joueur les a retirées de
// SA partie, et « débloquer 100 % des tuiles » ne doit pas lui rendre ce qu'il a payé pour ne
// plus voir. C'est la même règle que le tirage des paliers.
function doodleUltReward(s) {
  let tuiles = 0;
  for (const t of D_TILES) {
    if (s.tiles.indexOf(t.k) >= 0 || (s.banned || []).indexOf(t.k) >= 0) continue;
    s.tiles.push(t.k); tuiles++;
    if (t.k === 'slot') s.nextSlot = s.score + D_SLOT_STEP;   // 🎰 la dalle garantie repart de ce point, comme au déblocage normal
  }
  for (const l of D_LOOT) {
    // ⚠ Les butins INSTANTANÉS n'ont pas de niveau à monter : les porter à `D_ULT_STACK` aurait
    // écrit un compteur que personne ne lit. On les JOUE une fois, ce qu'ils sont.
    if (D_LOOT_INST.has(l.k)) { if (l.k === 'ammo') s.ammo = Math.max(s.ammo, D_ULT_AMMO); else doodleCure(s); continue; }
    const cible = l.max === Infinity ? D_ULT_STACK : l.max;
    if (s.wpn[l.k] >= cible) continue;
    const gagne = cible - s.wpn[l.k];
    s.wpn[l.k] = cible;
    if (l.k === 'shTime') s.shTimeLeft += D_SHTIME * gagne;
    // ✴️ Les lames sont des OBJETS en orbite, pas un compteur : il faut les créer une par une.
    if (l.k === 'shuriken') { s.shur = s.shur || []; for (let i = 0; i < D_SHURIKEN_N * gagne; i++) s.shur.push({ a: Math.random() * Math.PI * 2 }); }
  }
  for (const pk of D_PERKS) if (s.perks[pk.k] < D_ULT_PERK) s.perks[pk.k] = D_ULT_PERK;
  s.armorLeft = Math.max(s.armorLeft, s.perks.armor);   // 🛡️ la carapace se compte à part : sans ça, les niveaux offerts n'encaisseraient rien
  return tuiles;
}
const D_GRAP_GAP = 240, D_GRAP_REACH = 170, D_GRAP_V = 3.4, D_GRAP_HIT = 13, D_GRAP_PULL = 4.6;
const D_LIGHT_STEP = 120;
// 🚦 12.4.7 — LE FEU DONNE ET REPREND (demande utilisateur), il n'efface plus tout. Le rouge
// coûte D_LIGHT_TAKE niveaux de bonus et D_LIGHT_AMMO balles ; le vert, qui ne faisait rien,
// rend un bonus.
// ⚠ Le rouge passe par `doodleSpiritSteal`, le vol d'un niveau au hasard : il porte déjà les
// exclusions justes (ni boucliers, ni munitions, ni butin instantané) et laisse ce qui protège.
// Recopier une seconde règle de vol, c'était garantir que les deux finissent par diverger.
// ⚠ Le cadeau du vert est UNE FOIS PAR DALLE (`p.gift`), la punition du rouge non. Le feu change
// de couleur toutes les 2 s et un rebond en dure une : sans ce garde-fou, on attendait le vert
// sous la dalle et on y rebondissait en boucle pour ramasser un bonus permanent à chaque passage.
// Une punition, elle, ne se farme pas — elle reste donc répétable, comme avant.
const D_LIGHT_TAKE = 2, D_LIGHT_AMMO = 20;
function doodleLightPhase(p, t) { return Math.floor((t + (p.ph || 0)) / D_LIGHT_STEP) % 3; }
// ⚠ 10.5.0 — PORTÉE TRIPLÉE (demande utilisateur) : 150 → 450 points d'altitude. La bande
// couvre désormais bien plus que l'écran (480 px de haut) : la dalle nettoie tout ce qui vit
// à l'image, et au-delà. ⚠ L'onde dessinée lit la MÊME constante, elle s'écarte donc d'autant
// — c'est ce qui garde la promesse « l'effet montre sa propre zone » quand la zone déborde.
const D_SLAYER_R = 450, D_SLAYER_LIFE = 26;
// 🍄 10.8.0 — LE CHAMPIGNON NE RETOURNE PLUS L'ÉCRAN (demande utilisateur) : il fait un TRIP.
// Pendant D_SHROOM_LIFE frames (10 s) l'image ondule, les couleurs coulent, et des créatures
// qui n'existent pas se mettent à rôder.
// ⚠ Les HALLUCINATIONS NE TOUCHENT À RIEN : elles vivent dans `s.hall`, jamais dans `s.mobs`.
// C'est la promesse de la tuile — on esquive des monstres qui ne sont pas là. Les ranger avec
// les vrais monstres aurait fait d'un effet visuel la tuile la plus meurtrière du jeu.
// ⚠ L'ondulation reste FAIBLE et progressive (D_SHROOM_EASE au début comme à la fin) : à forte
// amplitude on ne vise plus une dalle, et le trip devient une mort et non un vertige.
const D_SHROOM_LIFE = 600, D_SHROOM_EASE = 24;
const D_HALL_EVERY = 46, D_HALL_LIFE = 190, D_HALL_MAX = 5;
// Montée puis descente de l'effet, entre 0 et 1 : tout le trip (ondulation, teintes,
// hallucinations) lit CE seul facteur, sinon chaque couche aurait sa propre fin.
function doodleShroomAmt(s) {
  if (!(s.shroom > 0)) return 0;
  const el = D_SHROOM_LIFE - s.shroom;
  return Math.max(0, Math.min(1, Math.min(el, s.shroom) / D_SHROOM_EASE));
}
// La déformation du monde : une lente respiration (échelle) plus un roulis de quelques degrés.
// ⚠ Bornée à D_SHROOM_TILT : au-delà, les bords de l'écran laissent voir du vide et la montée
// devient illisible.
const D_SHROOM_TILT = 0.055, D_SHROOM_BREATH = 0.045;
function doodleShroomWarp(s) {
  const a = doodleShroomAmt(s);
  if (!a) return null;
  const t = s.t || 0;
  return { rot: Math.sin(t * 0.021) * D_SHROOM_TILT * a,
           sc: 1 + Math.sin(t * 0.013) * D_SHROOM_BREATH * a,
           dx: Math.sin(t * 0.017) * 9 * a, dy: Math.cos(t * 0.011) * 7 * a, a };
}
// Le voile coloré, posé PAR-DESSUS le monde et SOUS le HUD : trois taches qui dérivent en
// `overlay`, plus une teinte d'ensemble. ⚠ Pas de `ctx.filter` : une teinte appliquée à tout
// le canvas à chaque frame coûte un repaint complet sur mobile, pour le même rendu.
const D_SHROOM_COLS = ['#ff3fa8', '#3fe8ff', '#b3ff3f', '#ffb03f', '#a83fff'];
function doodleShroomVeil(ctx, W, H, s) {
  const a = doodleShroomAmt(s);
  if (!a) return;
  const t = s.t || 0;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  for (let i = 0; i < 3; i++) {
    const cx = W * (0.5 + Math.sin(t * 0.009 + i * 2.1) * 0.42), cy = H * (0.5 + Math.cos(t * 0.007 + i * 1.7) * 0.42);
    const r = Math.max(W, H) * (0.42 + Math.sin(t * 0.012 + i) * 0.12);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, D_SHROOM_COLS[(i + Math.floor(t / 40)) % D_SHROOM_COLS.length]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.34 * a;
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.10 * a;
  ctx.fillStyle = D_SHROOM_COLS[Math.floor(t / 26) % D_SHROOM_COLS.length];
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
// Une hallucination : une créature du bestiaire, prise au hasard, qui dérive et s'efface.
// ⚠ Elle porte `hall:true` : le dessin s'en sert pour la rendre translucide et irisée, seul
// indice honnête qu'elle n'est pas réelle — sans lui, la tuile mentirait au lieu de troubler.
function doodleMakeHall(s, W, H) {
  const kinds = Object.keys(D_MOB_DRAW);
  const k = kinds[Math.floor(Math.random() * kinds.length)];
  return { x: 10 + Math.random() * (W - 70), y: 40 + Math.random() * (H - 140), w: 46, h: 40,
           type: 1, alive: true, kind: k, hall: true, rare: false, hp: 1,
           vx: (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.4),
           wave: 2 + Math.random() * 2, wt: Math.random() * 6.28, y0: 0,
           life: D_HALL_LIFE, max: D_HALL_LIFE };
}
// Éclatement de la bulle, d'où qu'il vienne (fin du compte à rebours ou tir) : gerbe d'irisations
// et saut ordinaire. ⚠ Un seul endroit pour les deux sorties, sinon l'une des deux aurait fini
// par oublier le saut promis et laisser le doodler tomber comme une pierre.
function doodleBubblePop(s) {
  s.fly = 0; s.flyType = null; s.vy = D_JUMP; s.inv = Math.max(s.inv, D_INV);
  s.lastPlat = null; s.bounceStreak = 0;
  for (let k = 0; k < 18; k++) { const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3.5; s.parts.push({ x: s.px, y: s.py, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 22, max: 22, sz: 2.5, c: k % 3 ? '#bfeaf8' : '#ffffff' }); }
  s.toast = { txt: '🫧 La bulle éclate !', life: D_TOAST_LIFE };
}
const D_ORIGAMI_STEP = 96;   // frames par forme, soit 1,6 s
function doodleOrigamiForm(p, t) { return Math.floor((t + (p.ph || 0)) / D_ORIGAMI_STEP) % 3; }
// 🖌️ 10.5.8 — PEINTURE FRAÎCHE (demande utilisateur) : une dalle qui REPEINT la peau du
// doodler et lui donne l'effet associé à la teinte, UNE SEULE FOIS par dalle. Chaque dalle
// tire sa teinte à sa naissance et l'AFFICHE : on choisit d'y aller ou pas en connaissance
// de cause, exactement comme le 🃏 Casino révèle la sienne au contact.
// ⚠ La couleur ne survit PAS à l'effet : elle s'éteint avec lui (ou avec sa consommation pour
// les teintes à usage unique). Une peau qui resterait teinte laisserait croire à un pouvoir
// qu'on n'a plus — c'est précisément le seul repère à l'écran qui dise ce qui est actif.
// ⚠ `life` en FRAMES comme toute durée du jeu ; `life: 0` = teinte CONSOMMABLE, qui ne
// s'épuise pas au temps mais à son usage (elle encaisse, elle écrase, elle relève).
// ⚠ 10.7.7 — Toutes les teintes MINUTÉES durent le même temps (D_PAINT_LIFE, 30 s) : les durées
// séparées d'avant (de 4 à 12 s) faisaient de la dalle une loterie sur la DURÉE en plus de la
// loterie sur l'effet, et rien à l'écran n'annonçait laquelle. Un temps unique, c'est un pari
// qui ne porte plus que sur ce que la teinte FAIT.
const D_PAINT_LIFE = 1800;
const D_PAINT_MARBLE_JUMP = 0.6, D_PAINT_MARBLE_G = 2;    // ⚪ Statue : lourde à monter, prompte à retomber
const D_PAINT_MINI_JUMP = 0.82, D_PAINT_MINI_SZ = 0.5;    // 🔷 Miniature : petites jambes, petite cible
const D_PAINT_GIANT_SZ = 1.8;                             // 🟧 Colosse : il écrase, mais il se prend tout
const D_PAINT_WIND = 2;                                   // 🩵 Courant d'air : pilotage doublé
const D_PAINT_CRYO_R = 46;                                // 🔵 Cryogène : rayon de gel
const D_PAINT_BOLT_GAP = 120, D_PAINT_BOLT_LIFE = 14;     // 🟡 Paratonnerre : un éclair toutes les 2 s
const D_PAINT_TOX_EVERY = 5, D_PAINT_TOX_LIFE = 90, D_PAINT_TOX_R = 20;   // 🟢 Toxique : dépôt, rémanence, portée
const D_PAINT_SIPHON_V = 4.2;                             // 🟣 Siphon : bien plus vif que l'aimant ordinaire
const D_PAINT_ANVIL_R = 78, D_PAINT_ANVIL_MUL = 1.35;     // 🩶 Enclume : souffle de l'impact et détente du choc
const D_PAINT_GUM_JUMP = 0.9;                             // 🩷 Élastique : le rebond mural relance un saut presque plein
const D_PAINTS = [
  // 🩸 10.10.2 — « SOIF DE SANG » REMPLACE « BERSERK » (demande utilisateur) : même effet, même
  // teinte, même durée — c'est une teinte de la 🖌️ Peinture fraîche et non une tuile à elle.
  // ⚠ La clé suit le nom (`bloodlust`) : laisser `berserk` dans le code aurait fait cohabiter
  // deux appellations pour une seule chose, et c'est ainsi qu'on finit par en oublier une.
  { k:'bloodlust', icon:'🔴', name:'Soif de sang', body:'#e2564a', dark:'#8f2a22', eye:'#4a1410', life: D_PAINT_LIFE, txt:'tu tues les créatures au CONTACT au lieu d\'en mourir' },
  { k:'cryo',     icon:'🔵', name:'Cryogène',       body:'#7fc9e0', dark:'#3a7f9c', eye:'#123647', life: D_PAINT_LIFE, txt:'toute créature qui t\'approche se fige sur place pour de bon' },
  { k:'bolt',     icon:'🟡', name:'Paratonnerre',   body:'#ffd54a', dark:'#c48f10', eye:'#5a3f00', life: D_PAINT_LIFE, txt:'la foudre frappe une créature à l\'écran toutes les 2 secondes' },
  { k:'shadow',   icon:'⚫', name:'Ombre',          body:'#4a4550', dark:'#221f28', eye:'#0d0b10', life: D_PAINT_LIFE, txt:'tu traverses créatures et trous noirs sans dégât — mais tu ne peux plus tirer' },
  { k:'marble',   icon:'⚪', name:'Statue',         body:'#eef2f5', dark:'#9aa6b0', eye:'#4a545c', life: D_PAINT_LIFE, txt:'rien ne peut te blesser, mais tu sautes bas et tu retombes comme une pierre' },
  { k:'toxic',    icon:'🟢', name:'Toxique',        body:'#8fe000', dark:'#4a7a00', eye:'#1e3300', life: D_PAINT_LIFE, txt:'tu laisses derrière toi une traînée corrosive, mortelle pour les créatures' },
  { k:'ember',    icon:'🟠', name:'Combustion',     body:'#ff8c3a', dark:'#a8481a', eye:'#3f1a08', life: D_PAINT_LIFE, txt:'tu t\'envoles en crachant des flammes, comme sous un jetpack' },
  { k:'siphon',   icon:'🟣', name:'Siphon',         body:'#a05ab0', dark:'#5a2b66', eye:'#22102a', life: D_PAINT_LIFE, txt:'tous les coffres et bonus de l\'écran filent vers toi, sans limite de portée' },
  { k:'gum',      icon:'🩷', name:'Élastique',      body:'#ff8fc8', dark:'#c0417f', eye:'#4d1030', life: D_PAINT_LIFE, txt:'les bords de l\'écran cessent d\'être traversants : tu rebondis dessus et ça relance un saut' },
  { k:'bark',     icon:'🟤', name:'Écorce',         body:'#a9743a', dark:'#5f3d16', eye:'#2a1a08', life:0,   txt:'elle encaisse UN coup à ta place, puis s\'en va' },
  { k:'anvil',    icon:'🩶', name:'Enclume',        body:'#9aa3ad', dark:'#5b626b', eye:'#22262b', life:0,   txt:'ton prochain atterrissage pulvérise la dalle et toutes les créatures alentour' },
  { k:'chrome',   icon:'✨', name:'Réflecteur',     body:'#dfe8f0', dark:'#8fa2b4', eye:'#3a4650', life: D_PAINT_LIFE, txt:'tirs de dalles, gouttes de lave et arcs électriques rebondissent sur toi' },
  { k:'invis',    icon:'🫥', name:'Invisible',      body:'#cfe0ef', dark:'#9db3c8', eye:'#5a6c80', life: D_PAINT_LIFE, txt:'plus rien ne te vise : grappins, dalles laser et esprits te ratent' },
  { k:'chaos',    icon:'🌈', name:'Instable',       body:'#ff8fc8', dark:'#6b3fd4', eye:'#2a1050', life: D_PAINT_LIFE, txt:'chaque rebond déclenche en plus l\'effet d\'une de tes tuiles, tirée au hasard' },
  { k:'gold',     icon:'🟨', name:'Doré',           body:'#ffd54a', dark:'#b8860b', eye:'#4a3300', life: D_PAINT_LIFE, txt:'l\'altitude gagnée compte DOUBLE' },
  { k:'wind',     icon:'🩵', name:'Courant d\'air', body:'#8fe8ff', dark:'#2f8fb0', eye:'#0d3a4a', life: D_PAINT_LIFE, txt:'tu te déplaces deux fois plus vite d\'un bord à l\'autre' },
  { k:'camo',     icon:'🫒', name:'Camouflage',     body:'#8a9a5b', dark:'#4d5a2a', eye:'#1e2410', life: D_PAINT_LIFE, txt:'les tuiles piégées (piques, picots, décharges, lasers, lave, arcs) deviennent inoffensives' },
  { k:'mini',     icon:'🔷', name:'Miniature',      body:'#4a6fd8', dark:'#26418f', eye:'#0d1a40', life: D_PAINT_LIFE, txt:'tu rétrécis de moitié : bien plus dur à toucher, mais tu sautes un peu moins haut' },
  { k:'giant',    icon:'🟧', name:'Colosse',        body:'#ff7a18', dark:'#a83f00', eye:'#3d1600', life: D_PAINT_LIFE, txt:'tu doubles de taille et tu écrases tout ce que tu touches en tombant — mais tu es une cible énorme' },
  { k:'revenant', icon:'💀', name:'Revenant',       body:'#f2f0e6', dark:'#a8a08c', eye:'#3a362c', life:0,   txt:'la prochaine mort te relève au lieu de t\'achever — chute dans le vide comprise' },
];
// 🌈 Instable : le vivier des effets qu'elle peut rejouer. ⚠ C'est une LISTE BLANCHE et non une
// liste d'exclusions : la plupart des tuiles lisent un état porté par LEUR dalle
// (`p.pipe`, `p.tama`, `p.egg`…) et rejouées sur une dalle étrangère elles ne feraient rien, ou
// pire, la transformeraient en une chose qu'elle n'est pas. Ne restent ici que les effets qui
// se suffisent à eux-mêmes. ⚠ Aucune tuile MORTELLE dedans : un rebond ne doit jamais tuer par
// surprise à cause d'une teinte qu'on porte.
const D_PAINT_CHAOS = ['bomb', 'meteor', 'magnet', 'slow', 'warp', 'invert', 'rebound', 'balloon', 'bubble', 'boost', 'gravity', 'negative', 'shroom', 'slayer', 'soap', 'recharge', 'confetti', 'popcorn', 'sticky', 'accord', 'tentacle', 'bhole', 'fractal', 'freeze', 'bamboo'];
function doodlePaintDef(k) { return D_PAINTS.find(p => p.k === k) || null; }
// La teinte ACTIVE, ou null. ⚠ Une teinte consommable (`life: 0`) porte `left: 0` et reste
// active jusqu'à son usage : c'est `s.skin` lui-même qui fait foi, pas son décompte.
function doodlePaint(s) { return s && s.skin ? s.skin : null; }
function doodlePaintIs(s, k) { const p = doodlePaint(s); return !!p && p.k === k; }
// ⚠ Palette LUE au dessin, jamais recopiée dans l'état : la 🌈 Instable change de teinte à
// chaque frame, une couleur figée à la pose l'aurait rendue immobile.
function doodlePaintPal(s) {
  const p = doodlePaint(s); if (!p) return null;
  const d = doodlePaintDef(p.k); if (!d) return null;
  if (p.k !== 'chaos') return { body: d.body, dark: d.dark, eye: d.eye };
  const h = ((s.t || 0) * 4) % 360;
  return { body: `hsl(${h},85%,62%)`, dark: `hsl(${h},75%,34%)`, eye: `hsl(${h},80%,18%)` };
}
function doodlePaintSize(s) { return doodlePaintIs(s, 'mini') ? D_PAINT_MINI_SZ : doodlePaintIs(s, 'giant') ? D_PAINT_GIANT_SZ : 1; }
// Fin de teinte : la peau redevient verte. ⚠ Point de passage UNIQUE (expiration comme
// consommation) — deux endroits qui remettent `skin` à null, c'est un des deux qui oubliera
// d'éteindre l'effet le jour où une teinte de plus s'ajoutera.
function doodlePaintEnd(s, why) {
  const p = doodlePaint(s); if (!p) return;
  s.skin = null;
  const d = doodlePaintDef(p.k);
  if (why && d) s.toast = { txt: `${d.icon} ${d.name} — ${why}`, life: D_TOAST_LIFE };
  for (let k = 0; k < 10; k++) { const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2.5; s.parts.push({ x: s.px, y: s.py, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 20, max: 20, sz: 2.5, c: k % 2 ? (d ? d.body : '#7ac043') : '#7ac043' }); }
}
// Pose d'une teinte. ⚠ Elle REMPLACE la précédente au lieu de s'y ajouter : deux effets de peau
// simultanés n'auraient eu qu'une seule couleur pour se dire, donc l'un des deux aurait été
// invisible. 🟠 La combustion est la seule à agir dès la pose (elle décolle).
function doodlePaintStart(s, k) {
  const d = doodlePaintDef(k); if (!d) return null;
  if (s.skin) doodlePaintEnd(s);
  s.skin = { k, left: d.life, max: d.life, tick: 0 };
  if (k === 'ember') { s.fly = d.life; s.flyType = 'jet'; s.vy = -6.4; s.lastPlat = null; s.bounceStreak = 0; }
  if (k === 'chaos') s.slip = 0;
  s.toast = { txt: `${d.icon} ${d.name} · ${d.txt}`, life: D_TOAST_LIFE * 1.4 };
  for (let j = 0; j < 20; j++) { const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3.5; s.parts.push({ x: s.px, y: s.py, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 26, max: 26, sz: 3, c: j % 2 ? d.body : d.dark }); }
  return d;
}
// Gerbe d'étincelles d'un projectile RENVOYÉ (✨ Réflecteur) ou éteint (🫒 Camouflage). ⚠ Sans
// elle, un tir qui traverse le doodler sans rien lui faire passe pour un bug d'affichage.
function doodlePaintSpark(s, x, y) {
  for (let k = 0; k < 12; k++) { const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; s.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 20, max: 20, sz: 2.5, c: k % 2 ? '#ffffff' : '#dfe8f0' }); }
}
// 🌈 Instable : un effet à rejouer, pris parmi les tuiles DÉBLOQUÉES qui figurent dans la liste
// blanche. ⚠ Rien si le joueur n'en a aucune : rejouer un effet qu'il n'a pas débloqué serait
// lui donner une tuile par la bande.
function doodlePaintChaosPick(s) {
  // ⚠ Les tuiles de BIOME déjà traversées comptent autant que les débloquées : plusieurs
  // effets du vivier (🫧 Bulle, 🦑 Tentacule…) ont quitté D_TILES pour un biome, et les lire
  // sur `s.tiles` seul aurait vidé l'Instable de la moitié de ses tours.
  const seen = (s.tiles || []).concat(doodleBiomeSeen(s, doodleTier(s.score || 0)));
  const pool = seen.filter(k => D_PAINT_CHAOS.indexOf(k) >= 0);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
// ☯️ 10.7.6 — YIN ET YANG, REPRISE (demande utilisateur) : le jeu de seuils est REMPLACÉ par
// un marché simple et lisible — chaque passage donne D_YY_PERKS bonus permanents de plus, et
// fait monter le taux d'apparition des monstres.
// ⚠ 11.2.8 — LE PRIX PASSE DE +10 % À +20 % (demande utilisateur) : le pacte se paie deux fois
// plus cher, et il n'a jamais été aussi vite ruineux — voir le « aucun plafond » ci-dessous.
// ⚠ Le +20 % est MULTIPLICATIF sur le taux courant, donc composé : ×1,20, ×1,44, ×1,73…
// (« +20 % par rapport à l'actuel, donc 100, 120, 144 »). Additif, la 5e dalle aurait doublé
// le taux et la 10e l'aurait triplé — au lieu de quoi c'est une ascension qui s'accélère, et
// c'est exactement ce qui fait le prix des bonus.
// ⚠ Aucun plafond : à force d'y revenir, le taux passe 1 et CHAQUE rangée éligible porte sa
// créature. C'est assumé — la dalle est un pacte, pas un cadeau — mais c'est aussi la fin des
// trous noirs, qui se tirent dans le même `else if` que les monstres et ne sortent donc plus.
// ⚠ Une seule fois par dalle (`p.used`) : elle reste une plateforme, elle ne rend plus.
const D_YY_PERKS = 2, D_YY_MOB = 1.20;
// 🐛 10.7.1 — BUGUÉE (demande utilisateur) : une dalle au design cyberpunk qui déraille, et qui
// DÉRIVE EN DIAGONALE — les deux axes à la fois, là où la 🟦 bleue ne va que de côté et le
// 🛗 Ascenseur que de haut en bas.
// ⚠ Sa dérive verticale est BORNÉE autour de sa ligne de naissance (D_GLITCH_SPAN), exactement
// comme l'ascenseur : libre, elle serait allée rejoindre la rangée voisine et aurait fait mentir
// l'écart entre rangées, seul garant qu'un saut reste faisable.
// ⚠ Elle rebondit sur les bords de l'écran en X : une dalle qui sortirait par le côté serait une
// rangée perdue, et on ne peut pas la suivre là où on ne peut pas aller.
// ⚠ Le parasitage est PUREMENT visuel et rythmé par paliers de D_GLITCH_STEP frames (`gb`) :
// retiré à chaque frame, l'image devenait un scintillement illisible — et surtout, une dalle
// dont la position AFFICHÉE saute n'est plus une dalle sur laquelle on peut viser un saut.
const D_GLITCH_VX = 1.0, D_GLITCH_VY = 0.55, D_GLITCH_SPAN = 40, D_GLITCH_STEP = 6;
// ⚠ Le déraillement de l'image ne prend qu'UN PALIER SUR TROIS : permanent, les trois canaux
// décalés se mélangeaient en une bouillie grise où le panneau ne se lisait plus. Il faut du
// propre pour que le cassé se voie.
const D_GLITCH_BREAK = 0.34;
// 🐛 10.7.3 — DÉCROCHAGE D'AFFICHAGE (demande utilisateur) : « parfois elle disparaît et
// réapparaît juste après ». Le décrochage dure UN palier de D_GLITCH_BLINK frames — d'où le
// « juste après » — et tombe une fois sur D_GLITCH_BLINK_P.
// ⚠ Il est PUREMENT VISUEL : la dalle reste solide et on rebondit dessus normalement pendant
// qu'elle est invisible. Une dalle qui cesserait d'exister le temps du clignotement serait un
// piège mortel, et rien dans « elle disparaît » ne demande de tomber au travers.
// ⚠ Son palier est PLUS LENT que celui du parasitage : au même rythme, la dalle passait son
// temps à s'éteindre et le décrochage se confondait avec un scintillement.
const D_GLITCH_BLINK = 9, D_GLITCH_BLINK_P = 0.10;
function doodleGlitchGone(p, t) { return doodleNz(Math.floor((t || 0) / D_GLITCH_BLINK) * 3.7 + p.x * 0.031) < D_GLITCH_BLINK_P; }
// Bruit déterministe : même entrée, même sortie. ⚠ `Math.random()` ici, c'était une dalle qui
// se déchire différemment à chaque frame, donc un clignotement au lieu d'un parasite.
function doodleNz(a) { const v = Math.sin(a * 12.9898) * 43758.5453; return v - Math.floor(v); }
function doodlePerkTotal(s) { let n = 0; for (const pk of D_PERKS) n += s.perks[pk.k] || 0; return n; }
// Amène le total de bonus à `cible` en répartissant les niveaux AU HASARD parmi les cinq.
// ⚠ Jamais tout sur le même : six niveaux de 🪶 Plume d'un coup, c'est un seul effet déjà
// plafonné, pas un renfort — et la dalle aurait rendu bien moins que ce qu'elle annonce.
function doodlePerkRaise(s, cible) {
  let n = doodlePerkTotal(s);
  while (n < cible) { s.perks[D_PERKS[Math.floor(Math.random() * D_PERKS.length)].k]++; n++; }
  s.armorLeft = Math.max(s.armorLeft, s.perks.armor);   // la carapace suit son bonus
  return n;
}
// 🎋 10.9.2 — BAMBOU (demande utilisateur) : le rebond arme D_BAMB_N passages, et les
// D_BAMB_N dalles suivantes sur lesquelles on se pose DEVIENNENT du bambou — leur effet, quel
// qu'il soit, est annulé pour de bon.
// ⚠ La conversion CHANGE `p.type` au lieu de poser un drapeau à tester partout : c'est le seul
// moyen d'éteindre d'un coup les dizaines de mécaniques qui se lisent sur le type (létalité de
// la 🌵 Pique, gouttes du 🔥 Magma, dérive de la 🐛 Buguée, cycle du 🚦 Feu…). Un drapeau, et
// il aurait fallu l'ajouter à chacune d'elles — et en oublier.
// ⚠ Les champs qui pilotent une mécanique À LA FRAME sont effacés en plus : ceux-là ne se
// lisent pas sur le type (`gvx`, `conf`, `fuse`, `egg`…) et une dalle convertie aurait continué
// de dériver, de cracher ou d'exploser sous son écorce de bambou.
// ⚠ `ori` et `tama` en font partie : `doodleSolid` les lit, et un bambou qu'on traverse ne
// serait plus une plateforme. `meals`/`tlaz` aussi : sans eux un 🥚 gavé changé en bambou
// continuerait de tirer depuis son écorce.
// ⚠ Le ressort et le trampoline sont CONSERVÉS : ce sont des objets posés sur la dalle, pas
// l'effet de la tuile — les retirer aurait été une punition que personne n'a demandée.
const D_BAMB_N = 3;
const D_BAMB_CLEAR = ['roll', 'mim', 'gvx', 'vy2', 'y0', 'span2', 'ax', 'ay', 'boo', 'conf',
  'fade', 'fuse', 'tent', 'pcool', 'steam', 'lava', 'laz', 'grap', 'grapCool', 'egg', 'ori',
  'lit', 'tama', 'meals', 'tlaz', 'lazFire', 'armed', 'sink', 'stal', 'stalLeft', 'stalHits', 'mum', 'dir', 'uses', 'pipe', 'pool', 'pop', 'eat'];
function doodleBambooify(s, p) {
  s.bambLeft--;
  p.type = 'bambooed';
  p.vx = 0;
  for (const k of D_BAMB_CLEAR) delete p[k];
}
// 📈 Multiplicateur de score. ⚠ Il ne s'applique qu'à l'altitude GAGNÉE APRÈS coup, jamais au
// total déjà acquis (voir l'accumulateur `scoreRaw` dans la boucle) : le prendre ne fait donc
// rien bouger à l'écran, il change seulement ce que vaudra la suite de la montée.
// ⚠ Il ne fait que CROÎTRE, et l'altitude aussi : le score reste monotone, ce dont dépend tout
// le reste (paliers de bonus, déblocage des tuiles, biomes, bouclier temporel). Un
// multiplicateur qui pourrait redescendre ferait reculer le score, et un palier déjà franchi
// se redéclencherait en boucle.
const D_BOOST_MUL = 1.05;
const D_BOOST_USES = 3;   // … et pas plus de trois passages par dalle
// 🔍 10.10.3 — ZOOM / DÉZOOM (demande utilisateur) : la dalle change l'échelle du monde de
// D_ZOOM_STEP, dans un sens ou dans l'autre, à pile ou face. UNE seule fois par dalle.
// ⚠ C'est un effet de VUE, jamais de physique : rien ne change dans les distances de saut ni
// dans les collisions, seul le dessin est mis à l'échelle. Toucher aux constantes du jeu
// aurait fait d'un gadget visuel le réglage le plus dangereux du moteur.
// ⚠ Le facteur est MULTIPLICATIF et son inverse exact (×1,02 / ÷1,02) : en ajoutant et
// retranchant 0,02, deux dalles opposées n'auraient pas ramené à l'échelle d'origine.
// ⚠ BORNÉ des deux côtés. Trop dézoomé, le monde ne remplit plus le cadre — le jeu ne
// génère de plateformes que sur la largeur de l'écran, et au-delà il n'y a rien à montrer ;
// trop zoomé, on ne voit plus la rangée suivante et la montée devient un pari.
const D_ZOOM_STEP = 1.02, D_ZOOM_MIN = 0.82, D_ZOOM_MAX = 1.22;
// ⚙️ 10.9.8 — LE PIÈGE À PICOTS RALENTIT (demande utilisateur, « la tuile va trop vite ») :
// le CYCLE passe de 1,8 s à 2,6 s, la phase mortelle ne bouge pas. La fenêtre sûre entre deux
// sorties de piques passe donc de 1,0 s à 1,8 s — on a le temps de voir venir.
// ⚠ C'est le cycle qui s'allonge et NON la phase mortelle qui raccourcit : le piège garde sa
// morsure, il la donne simplement moins souvent. Raccourcir `ON` aurait rendu la dalle
// franchissable en force, sans jamais avoir à lire son rythme.
// ⚠ `D_PICOT_TELL` est l'annonce lumineuse AVANT la sortie, en frames et non en fraction du
// cycle : allonger le cycle ne doit pas allonger le préavis, sinon le liseré resterait allumé
// la moitié du temps et n'annoncerait plus rien.
const D_PICOT_CYCLE = 156, D_PICOT_ON = 46, D_PICOT_TELL = 20;   // ⚙️ 2,6 s de cycle, piques sorties sur ~0,8 s
// 🌈 10.11.0 — L'ARC-EN-CIEL QUITTE LE BIOME NUAGES (demande utilisateur) : ce n'est pas une
// tuile de ciel, c'est une tuile BONUS — elle rejoint donc D_TILES et se débloque au palier
// comme les autres, quel que soit le biome où l'on se trouve.
// ⚠ 11.2.6 — REWORK (demande utilisateur). Elle naît toujours avec un SECOND PIED sur la même
// rangée, mais ce pied n'est plus une seconde arc-en-ciel : deux fois la même tuile alignées
// ne servaient qu'à tendre l'arc. C'est désormais une VRAIE tuile de la partie en cours —
// débloquée, venue d'un biome traversé, ou une plateforme ordinaire — avec son effet ACTIF,
// née par `doodleTileBirth` comme n'importe quelle autre dalle.
// ⚠ Plus de pile ou face : la MÈRE porte toujours le 📦 coffre, et ce coffre donne toujours un
// butin. Le 🌈 monstre arc-en-ciel, lui, apparaît TOUJOURS aussi — mais SUR LE SECOND PIED,
// à l'instant où la paire entre à l'écran, et il fonce droit sur le doodler (D_RBMOB_HP tirs
// pour l'abattre). Le marché n'est plus une loterie : un coffre sûr contre un monstre sûr,
// et l'arc dit d'un coup d'œil des deux côtés d'où viendra chaque chose.
// ⚠ L'arc est purement décoratif : il relie, il ne porte pas. En faire une passerelle, c'était
// offrir gratuitement la traversée que le jeu vend au prix d'un saut.
// ⚠ Le lien est une RÉFÉRENCE à l'autre dalle, jamais deux coordonnées figées : l'arc suit une
// dalle qui se déplace et se retire avec elle quand elle meurt.
const D_RBOW_MINX = 96;        // écart minimal entre les deux pieds de l'arc, en px
// ⚠ 11.2.5 — VITESSE DOUBLÉE (demande utilisateur) : 0,55 → 1,10 px/frame. Le monstre
// arc-en-ciel n'est plus une menace qu'on distance en marchant : il faut le tuer.
const D_RBMOB_HP = 3, D_RBMOB_V = 1.10, D_RBMOB_W = 42, D_RBMOB_H = 38;
// ⚠ `homing` et non `vx` : le monstre arc-en-ciel ne patrouille pas, il fond droit sur le
// doodler. Lui donner une vitesse latérale l'aurait renvoyé sur les bords comme les autres.
function doodleMakeRbMob(x, y) {
  return { x, y, w: D_RBMOB_W, h: D_RBMOB_H, type: 1, alive: true, kind: 'rbmob', icon: '🌈',
           rare: true, hp: D_RBMOB_HP, homing: D_RBMOB_V, wt: Math.random() * 6.28 };
}
// ⚠ Les deux poids de copie sont déclarés ICI, bien au-dessus de leur usage réel
// (`doodleCopyW`) : le TEXTE de la tuile 🎰 les lit dans D_TILES, table évaluée plus haut que le
// reste du fichier. Les laisser près de la fonction, c'était une TDZ — donc un écran noir (piège 2).
const D_COPY_W_RARE = 0.2, D_COPY_W_BIOME = 0.4;
// ⏲️ 12.5.2 — LE BALANCIER (demande utilisateur) : un pendule pendu SOUS la dalle, qui
// bascule de gauche à droite sans fin et tue au contact — les créatures comme le doodler.
// ⚠ C'est le seul danger du jeu qui soit à la fois PERMANENT (il ne s'arme pas, ne se
// déclenche pas, ne s'épuise pas) et ENTIÈREMENT LISIBLE : sa course est un sinus, donc on
// la lit d'un coup d'œil et on sait où la masse sera au moment où l'on passera. C'est ce qui
// autorise un danger qu'on ne peut ni désamorcer ni esquiver par le haut.
// ⚠ La masse pend SOUS la dalle : se poser dessus ne risque donc jamais rien, et c'est
// volontaire — une dalle qui tue celui qui s'y pose aurait fait doublon avec la 🌵 Pique.
// ⚠ La phase est TIRÉE À LA NAISSANCE (`p.pph`) : sans elle, tous les balanciers de l'écran
// battraient à l'unisson et il n'y aurait qu'un seul instant sûr pour toute la colonne.
// ⚠ L'angle se déduit de `s.tw` (le temps de jeu RALENTI par ⏱️), jamais de `s.t` : le
// ralentisseur doit ralentir le balancier comme il ralentit tout le reste.
const D_PEND_LEN = 46;        // longueur de la tige, du pivot au centre de la masse
const D_PEND_R = 9;           // rayon de la masse
const D_PEND_ANG = 1.15;      // amplitude, en radians (~66° de part et d'autre de la verticale)
const D_PEND_SPD = 0.028;     // vitesse angulaire : ~3,7 s l'aller-retour complet
const D_PEND_HIT = 12;        // marge de contact ajoutée au rayon, côté doodler
function doodlePendAng(p, t) { return Math.sin(t * D_PEND_SPD + (p.pph || 0)) * D_PEND_ANG; }
// Centre de la masse, en coordonnées d'écran. ⚠ Le pivot est le MILIEU DU DESSOUS de la dalle
// et se relit à chaque frame : la dalle peut dériver (🌬️ vent, 🐛 Buguée, 🛋️ Ascenseur) et le
// balancier doit la suivre au lieu de rester pendu dans le vide.
function doodlePendPos(p, t) {
  const a = doodlePendAng(p, t);
  return { x: p.x + p.w / 2 + Math.sin(a) * D_PEND_LEN, y: p.y + p.h + Math.cos(a) * D_PEND_LEN, a };
}
const D_TILES = [
  { k: 'warp',  icon: '🌀', name: 'Téléporteur', txt: 'te renvoie sur une dalle tirée au hasard, n\'importe où à l\'écran' },
  { k: 'bomb',  icon: '🧨', name: 'Bombe',       txt: 'explose et nettoie les monstres' },
  // ⚠ 9.4.4 — Cinq tuiles de plus (demandes utilisateur). La « friable » demandée n'est PAS
  // reprise : la ☁️ Nuage et la ⚪ blanche du jeu d'origine couvrent déjà la dalle à usage unique.
  { k: 'picots', icon:'⚙️', name: 'Piège à picots', txt: 'des piques sortent toutes les ' + (D_PICOT_CYCLE / 60).toFixed(1).replace('.', ',') + ' s et restent ' + (D_PICOT_ON / 60).toFixed(1).replace('.', ',') + ' s : un liseré les annonce, saute au bon moment' },
  { k: 'belt',   icon:'➡️', name: 'Tapis roulant',  txt: 'entraîne vers la gauche ou la droite dès le contact' },
  { k: 'magnet', icon:'🧲', name: 'Aimantée',       txt: 'attire les coffres et bonus alentour quand on s\'y pose' },
  { k: 'slow',   icon:'⏱️', name: 'Ralentisseur',   txt: 'ralentit le temps pendant 10 secondes' },
  // ⚠ 9.5.7 et suivants — Vague de tuiles demandée par l'utilisateur. Toutes suivent la règle
  // commune : une de plus débloquée par palier de D_TILE_STEP points, tirée au sort parmi les restantes.
  { k: 'spawner', icon:'👹', name: 'Générateur',    txt: 'fait surgir un monstre au-dessus de toi — une seule fois, puis elle s\'éteint' },
  { k: 'accord',  icon:'🪗', name: 'Accordéon',     txt: 'se comprime sous le poids, puis se détend d\'un coup et te propulse très haut' },
  { k: 'casino',  icon:'🃏', name: 'Casino',        txt: 'imite au hasard une autre tuile débloquée du catalogue, jamais une tuile de biome — chaque dalle a le sien, tiré à sa naissance' },
  { k: 'boomer',  icon:'🪃', name: 'Boomerang',     txt: 'se détache au rebond, décrit un arc, puis revient exactement à sa place' },
  { k: 'lift',    icon:'🛗', name: 'Ascenseur',     txt: 'monte et descend sans arrêt le long de sa ligne' },
  { k: 'rebound', icon:'🦘', name: 'Rebond',        txt: 'les 3 prochains sauts montent deux fois plus haut' },
  { k: 'invert',  icon:'🔃', name: 'Inversion',     txt: 'inverse la gauche et la droite pendant ' + Math.round(D_INVERT_LIFE / 60) + ' secondes' },
  { k: 'slot',    icon:'🎰', name: 'Machine à sous', txt: 'met le jeu en pause et tire 3 tuiles, aussitôt ajoutées à la partie — trois tuiles DIFFÉRENTES, et jamais une que tu possèdes déjà. Elle sait aussi copier une tuile de BIOME, bien plus rarement : un poids de ' + Math.round(D_COPY_W_BIOME * 100) + ' % pour les deux tuiles ordinaires d\'un biome et de ' + Math.round(D_COPY_W_RARE * 100) + ' % pour sa rare, contre 100 % pour une tuile du catalogue' },
  { k: 'freeze',  icon:'⏸️', name: 'Pause',          txt: 'fige tous les monstres pour le reste de la partie… ou double leur vitesse. Une chance sur deux, et chaque nouvelle dalle annule la précédente' },
  { k: 'balloon', icon:'🎈', name: 'Ballon',         txt: 'un ballon gonfle sous toi, t\'emporte en l\'air, puis éclate' },
  { k: 'target',  icon:'🎯', name: 'Cible',          txt: 'atterris pile au centre et tu gagnes un butin de coffre ; sinon elle se détruit' },
  { k: 'roulette', icon:'🎲', name: 'Roulette russe', txt: 'plusieurs dalles identiques apparaissent, une seule est réelle — et il y en a une de plus à chaque fois' },
  { k: 'clone',   icon:'👥', name: 'Clones',         txt: '4 clones jaillissent et partent dans tous les sens, rebondissant partout jusqu\'à tomber' },
  { k: 'boost',   icon:'📈', name: 'Multiplicateur', txt: 'chaque passage augmente de ' + Math.round((D_BOOST_MUL - 1) * 100) + ' % le multiplicateur de score, pour toute la partie — mais il ne s\'applique qu\'à l\'altitude GAGNÉE ENSUITE, jamais à celle déjà acquise : ton compteur ne bouge pas au rebond, c\'est la suite de la montée qui rapporte plus. ' + D_BOOST_USES + ' passages par dalle au maximum' },
  // ⚠ 9.7.6 — 🔀 RANDOMISEUR (demande utilisateur) : au rebond, TOUTES les dalles visibles
  // échangent leurs places entre elles. ⚠ C'est une PERMUTATION des positions occupées, jamais un
  // tirage de nouvelles coordonnées : l'ensemble des points d'appui reste EXACTEMENT le même, donc
  // aucune rangée ne devient infranchissable — seul l'endroit où se trouve chaque type change. Un
  // placement libre aurait pu ouvrir un trou de plus de D_GAP_MAX et condamner la montée.
  { k: 'shuffle', icon:'🔀', name: 'Randomiseur',   txt: 'toutes les dalles visibles échangent leurs places au hasard' },
  // 🚇 9.8.6 — TUYAUX (demande utilisateur) : ils naissent TOUJOURS par deux, à portée de vue
  // l'un de l'autre, et se répondent. Sauter dans l'un ressort par l'autre.
  // ⚠ 12.4.2 — UNE SEULE TRAVERSÉE POUR LA PAIRE (demande utilisateur) : les deux bouches se
  // bouchent ensemble à la sortie. Sans ça, on retombait sur celle d'arrivée, qui renvoyait vers
  // celle de départ, qui renvoyait… — un aller-retour sans fin, à la même hauteur, dont rien ne
  // faisait sortir. Bouchées, ce sont deux dalles ordinaires, et le second rebond est classique.
  { k: 'pipe',    icon:'🚇', name: 'Tuyaux',        txt: 'ils naissent par deux : saute dans l\'un, tu ressors par l\'autre — une seule fois, puis les deux bouches se bouchent et ne sont plus que des dalles ordinaires' },
  // 🪙 9.9.1 — QUITTE OU DOUBLE (demande utilisateur) : une seule fois par dalle, pile ou face.
  { k: 'gamble',  icon:'🪙', name: 'Quitte ou double', txt: 'une chance sur deux de DOUBLER le NOMBRE de tes effets (autant de neufs que tu en as, au moins ' + D_GAMBLE_MIN + ') et de tes tuiles… une chance sur deux d\'en perdre la MOITIÉ, tirée au hasard — jamais tout' },
  // 🕯️ 9.9.6 — ESPRITS (demande utilisateur) : trois apparitions qui fondent sur toi chacune
  // leur tour pour te voler un bonus. Elles ne font AUCUN dégât.
  { k: 'spirit',  icon:'🕯️', name: 'Esprits',      txt: 'trois esprits t\'encerclent et fondent sur toi l\'un après l\'autre pour te voler un bonus — esquive-les' },
  // 🎊 10.1.3 — CONFETTIS (demande utilisateur) : purement festive, elle ne fait RIEN d'autre.
  { k: 'confetti', icon:'🎊', name: 'Confettis',    txt: 'elle crache des confettis pendant 5 secondes, qui retombent ensuite — de la pure décoration' },
  { k: 'recharge', icon:'🔋', name: 'Recharge',       txt: '+' + D_RECHARGE + ' balles à chaque passage, autant de fois que tu y reviens' },
  { k: 'flag',     icon:'🚩', name: 'Drapeau',        txt: 'elle hisse le drapeau d\'un pays au bout d\'un mât, et en change à chaque rebond — de la pure décoration' },
  { k: 'notif',    icon:'🔔', name: 'Notif',          txt: 'elle fait surgir une fausse notification de téléphone — ou la barre de volume qui descend. Aucun effet sur le jeu, et une seule fois par dalle' },
  { k: 'egg',      icon:'🪺', name: 'Œuf',            txt: 'pose-toi dessus avant ' + D_EGG_JUMPS + ' sauts ou il éclôt et lâche un 🐉 dragonneau — il patrouille en largeur ET en hauteur, crache un trait de feu visé et encaisse ' + D_HATCH_HP + ' tirs. Et l\'œuf change de place à chacun de tes sauts' },
  { k: 'negative', icon:'🎨', name: 'Inverseuse',      txt: 'toutes les couleurs du jeu s\'inversent pendant ' + Math.round(D_NEG_LIFE / 60) + ' secondes' },
  { k: 'mercy',    icon:'🕊️', name: 'Miséricordieuse', txt: 'elle met le jeu en pause, te montre les tuiles débloquées de la partie et t\'en laisse bannir une pour de bon ; à la reprise, elle t\'offre un bouclier. Quand il ne reste plus rien à bannir, elle se retire elle-même' },
  { k: 'fractal',  icon:'🔺', name: 'Fractale',       txt: 'elle disparaît sous toi et se remplace par deux dalles plus petites à la même hauteur, qui feront de même — jusqu\'à ' + D_FRACT_GEN + ' générations' },
  { k: 'quest',    icon:'🎯', name: 'Quête',          txt: 'elle te confie un défi tiré au sort parmi ceux qui ne tournent pas déjà ; le réussir fait tomber du ciel une PLUIE DE COFFRES — un par tranche de ' + D_QUEST_RAIN_PER + ' points d\'altitude, un au minimum. Ils se posent où ils tombent : à toi d\'aller les chercher. Les ' + D_QUESTS.length + ' défis peuvent courir de front, et les avoir tous les ' + D_QUESTS.length + ' en même temps rapporte ' + D_QUEST_TRIO + ' butins de plus, tout de suite. 🏅 Une fois les ' + D_QUESTS.length + ' RÉUSSIS, la QUÊTE ULTIME s\'ouvre d\'elle-même — abats ' + D_ULT_KILLS + ' créatures, rebondis sur ' + D_ULT_KINDS + ' sortes de tuiles et terrasse ' + D_ULT_BOSS + ' boss : elle débloque 100 % des tuiles d\'un coup et pousse toutes les améliorations et tous les bonus permanents à leur maximum' },
  { k: 'alive',    icon:'👀', name: 'Vivante',        txt: 'elle a des yeux, elle te regarde et elle se traîne vers toi — sans jamais s\'éloigner beaucoup de l\'endroit où elle est née' },
  { k: 'mimic',    icon:'🪞', name: 'Mimétique',      txt: 'elle prend l\'apparence ET l\'effet de la dernière dalle sur laquelle tu as rebondi — elle change donc au fil de la partie' },
  { k: 'glue',     icon:'🩹', name: 'Pot de colle',   txt: 'elle garde sa hauteur et se déplace pour rester juste sous toi — jusqu\'à ton premier rebond dessus : le pot est vidé, elle se fige et n\'est plus qu\'une dalle ordinaire' },
  { k: 'chameleon', icon:'🦎', name: 'Caméléon',      txt: 'elle prend l\'apparence d\'une tuile DÉJÀ PRÉSENTE dans la partie — débloquée ou venue d\'un biome traversé — et n\'en a aucun des effets : c\'est une plateforme ordinaire. Sans rien à imiter, elle reste une dalle verte' },
  { k: 'grapple',  icon:'🪝', name: 'Grappin',        txt: 'elle lance un grappin sur toi de temps en temps : s\'il t\'accroche, il te ramène sur la dalle, où tu repars d\'un saut' },
  { k: 'light',    icon:'🚦', name: 'Feu tricolore',  txt: 'elle passe du vert au jaune puis au rouge toutes les ' + Math.round(D_LIGHT_STEP / 60) + ' secondes : VERTE elle t\'offre 1 bonus (une seule fois par dalle), JAUNE on glisse, ROUGE elle te prend ' + D_LIGHT_TAKE + ' niveaux de bonus et ' + D_LIGHT_AMMO + ' balles' },
  { k: 'fog',      icon:'🌁', name: 'Brouillard',     txt: 'toutes les dalles disparaissent pour le saut qui suit — elles réapparaissent dès que tu en retouches une' },
  { k: 'slayer',   icon:'☠️', name: 'Destructrice',    txt: 'le rebond pulvérise toutes les créatures à moins de ' + D_SLAYER_R + ' points d\'altitude de la dalle, au-dessus comme en dessous — et chacune lâche son coffre' },
  { k: 'lazer',    icon:'🔴', name: 'Laser',           txt: 'son canon te suit et elle tire un trait lent toutes les ' + Math.round(D_TLASER_GAP / 60) + ' secondes — pendant les ' + (D_TLASER_TEL / 60).toFixed(1).replace('.', ',') + ' s qui précèdent le coup, un rayon de visée en pointillés s\'allonge devant elle et deux anneaux se referment sur son œil : c\'est le moment de bouger. Se prendre le tir fait mal' },
  { k: 'tamagotchi', icon:'🥚', name: 'Tamagotchi',  txt: 'elle a faim : on la traverse tant qu\'elle n\'a rien mangé. 1 balle → repue et heureuse, elle devient une plateforme qui te propulse comme un ressort · 2 balles → fin d\'appétit, elle jaunit et ne rend plus qu\'un saut ordinaire · 3 balles → gavée, elle vire au rouge et te TIRE dessus toutes les ' + Math.round(D_TAMA_GAP / 60) + ' secondes' },
  { k: 'clay',     icon:'🧱', name: 'Fragile', txt: 'elle s\'enfonce un peu plus sous chaque rebond, et finit par se dérober' },
  { k: 'popcorn',  icon:'🍿', name: 'Pop-corn',       txt: 'elle éclate sous tes pieds et la hauteur du saut est tirée au sort, entre un peu moins et un peu plus qu\'un saut ordinaire. Au premier rebond, elle TIRE en plus ' + D_POP_THROW + ' grains en gerbe, vers le haut ou vers le bas à pile ou face : ils tuent les créatures qu\'ils touchent, les TRAVERSENT pour faucher les suivantes, et ne s\'arrêtent qu\'en sortant de l\'écran' },
  { k: 'sticky',   icon:'🍯', name: 'Collante',       txt: 'tu restes collé dessus ' + Math.round(D_STICKY_HOLD / 60) + ' secondes, puis tu repars d\'un saut ordinaire' },
  { k: 'origami',  icon:'🪷', name: 'Origami',        txt: 'elle se plie et se déplie sans fin en trois formes : dalle ordinaire, super saut, puis dalle qu\'on traverse — la forme se voit avant d\'atterrir' },
  { k: 'soap',     icon:'🧼', name: 'Savon',          txt: 'tu glisses pendant ' + Math.round(D_SOAP_LIFE / 60) + ' secondes dans la direction inverse de celle d\'où tu arrivais' },
  // 🖌️ 10.5.8 — voir D_PAINTS : la dalle porte SA teinte dès sa naissance, et ne la donne qu'une fois.
  { k: 'paint',    icon:'🖌️', name: 'Peinture fraîche', txt: 'elle repeint ta peau de la teinte qu\'elle affiche — une des ' + D_PAINTS.length + ' — et te donne l\'effet qui va avec, une seule fois par dalle' },
  { k: 'zoom',     icon:'🔍', name: 'Zoom',           txt: 'à pile ou face, elle rapproche ou éloigne la vue de ' + Math.round((D_ZOOM_STEP - 1) * 100) + ' % — pour le reste de la partie, et ça se cumule. C\'est l\'ÉCHELLE DU DESSIN qui bouge, jamais les distances de saut. Une seule fois par dalle' },
  { k: 'bamboo',   icon:'🎋', name: 'Bambou',         txt: 'les ' + D_BAMB_N + ' prochaines dalles sur lesquelles tu te poses deviennent du bambou : leur effet, quel qu\'il soit, est annulé pour de bon — et ce sont désormais de simples plateformes' },
  { k: 'yinyang',  icon:'☯️', name: 'Yin et Yang',     txt: 'un pacte : +' + D_YY_PERKS + ' bonus permanents, et ' + Math.round((D_YY_MOB - 1) * 100) + ' % de créatures en plus pour le reste de la partie. Le taux se COMPOSE d\'une dalle à l\'autre (×' + D_YY_MOB.toFixed(2) + ', ×' + (D_YY_MOB * D_YY_MOB).toFixed(2) + ', ×' + (D_YY_MOB * D_YY_MOB * D_YY_MOB).toFixed(2) + '…) et ne redescend jamais. Une seule fois par dalle' },
  { k: 'pendul',   icon:'⏲️', name: 'Balancier',      txt: 'un pendule pend sous la dalle et balaie sans fin de gauche à droite : tout ce que la masse touche meurt — les créatures comme toi. Se poser sur la dalle ne risque rien, le danger est EN DESSOUS' },
  // 🌈 11.2.6 — un arc tendu entre la dalle mère et un SECOND PIED qui est une vraie tuile de
  // la partie. Coffre garanti d'un côté, monstre garanti de l'autre.
  { k: 'rbow',     icon:'🌈', name: 'Arc-en-ciel',    txt: 'elle naît avec un SECOND PIED sur la même rangée et un arc-en-ciel se tend de l\'une à l\'autre — décor pur, il ne porte pas. Ce second pied est une vraie tuile de ta partie (débloquée, de biome, ou une plateforme ordinaire), effet compris. La dalle mère porte TOUJOURS un coffre de butin ; le second pied lâche TOUJOURS un monstre arc-en-ciel, qui encaisse ' + D_RBMOB_HP + ' tirs et fonce droit sur toi' },
];
// 🕯️ Les trois postes de guet, en fractions de l'écran : haut-gauche, haut-droit, bas-droit.
// ⚠ Ce sont des positions D'ÉCRAN, pas de monde : les esprits ne suivent PAS la caméra, ils
// restent plantés là où on les voit tant qu'ils n'ont pas chargé — c'est ce qui les rend
// lisibles pendant qu'on continue de grimper.
const D_SPIRIT_POSTS = [[0.14, 0.16], [0.86, 0.16], [0.86, 0.74]];
// Chacun charge à son tour, D_SPIRIT_WAIT frames après le précédent. La charge vise la
// position du doodler À CET INSTANT et ne se corrige plus : c'est ce qui la rend esquivable.
const D_SPIRIT_WAIT = 78, D_SPIRIT_V = 7.4, D_SPIRIT_R = 15;
// 🚇 Écart vertical entre les deux bouches d'une paire — « relativement proche », soit une à
// deux rangées. ⚠ Le jumeau est posé EN DESSOUS de la rangée courante : au-dessus, il abaisserait
// `topY` et la boucle de génération croirait la rangée suivante déjà faite, ouvrant un trou.
const D_PIPE_DY = [58, 96], D_PIPE_COOL = 34, D_PIPE_MINX = 84;
const D_PIPE_RISE = 17, D_PIPE_COL_H = 6;  // 🚇 hauteur dont le tuyau dépasse de sa dalle, et
                                           // épaisseur de son col — dessin seul, la boîte de
                                           // collision reste celle de la plateforme
// Une couleur d'anneau par paire : sans elle, trois tuyaux à l'écran ne disent pas qui répond à qui.
const D_PIPE_PAL = ['#ffd54a', '#ff8fc8', '#8fe8ff', '#ffffff'];
// 🪙 Quitte ou double. ⚠ « Doubler les bonus » = doubler les NIVEAUX (un bonus de niveau 3
// passe à 6), pas en ajouter un de plus : c'est la seule lecture qui rende le pari
// proportionnel à ce qu'on a déjà accumulé, et donc de plus en plus gros à mesure qu'on monte.
// ⚠ Les niveaux restent bornés par les plafonds de D_LOOT : sans cela, un éventail doublé
// deux fois aurait dépassé D_SPREAD_MAX et cassé l'économie des tirs.
// ⚠ La perte n'efface QUE ce qui a été gagné en jeu (bonus, améliorations, boucliers, tuiles).
// Ni les munitions ni le score n'y passent : perdre ses balles condamnerait la partie sans
// qu'aucun geste puisse la rattraper.
// ⚠ 10.0.8 — LE GAIN DOUBLE LE NOMBRE D'EFFETS, PAS LEURS NIVEAUX (demande utilisateur) :
// « si j'en ai 2 ça passe à 4 ». On compte les effets DISTINCTS possédés et on en accorde
// autant de neufs — d'abord ceux qu'on n'a PAS encore (le vrai « ça passe à 4 »), et seulement
// une fois la collection complète, +1 niveau sur un effet cumulable encore sous son plafond.
// Un cran d'un butin d'arme, avec les effets de bord que `doodleLootGrant` lui associe
// (le temporel ajoute ses points, les shurikens ajoutent leurs lames sur l'orbite).
function doodleGambleLoot(s, l) {
  s.wpn[l.k] = (s.wpn[l.k] || 0) + 1;
  if (l.k === 'shTime') s.shTimeLeft += D_SHTIME;
  if (l.k === 'shuriken') { s.shur = s.shur || []; for (let i = 0; i < D_SHURIKEN_N; i++) s.shur.push({ a: i / D_SHURIKEN_N * Math.PI * 2 + Math.random() * 0.3 }); }
}
// Un gain : un effet NEUF si la collection est incomplète, sinon +1 sur un cumulable.
// Renvoie le libellé accordé, ou null quand tout est au plafond.
function doodleGambleGrant(s) {
  const fresh = [], more = [];
  for (const p of D_PERKS) (s.perks[p.k] > 0 ? more : fresh).push({ icon: p.icon, label: p.label, cap: Infinity, lvl: () => s.perks[p.k], give: () => { s.perks[p.k]++; s.armorLeft = Math.max(s.armorLeft, s.perks.armor); } });
  for (const l of D_LOOT) {
    if (D_LOOT_INST.has(l.k)) continue;                              // 🧴 📦 rien à doubler : ils n'ont pas de niveau
    const lvl = s.wpn[l.k] || 0;
    if (lvl >= l.max) continue;                                     // déjà au plafond de D_LOOT : hors des deux paniers
    (lvl > 0 ? more : fresh).push({ icon: l.icon, label: l.label, lvl: () => s.wpn[l.k] || 0, give: () => doodleGambleLoot(s, l) });
  }
  const pool = fresh.length ? fresh : more;
  if (!pool.length) { s.ammo += D_AMMO_PICK; return `📦 +${D_AMMO_PICK} balles`; }
  const g = pool[Math.floor(Math.random() * pool.length)];
  g.give();
  const n = g.lvl();
  return `${g.icon} ${g.label}${n > 1 ? ' ×' + n : ''}`;
}
function doodleGamble(s) {
  const win = Math.random() < 0.5;
  if (win) {
    let held = 0;
    for (const p of D_PERKS) if (s.perks[p.k] > 0) held++;
    for (const l of D_LOOT) if (!D_LOOT_INST.has(l.k) && s.wpn[l.k] > 0) held++;
    const got = [];
    for (let i = 0, n = Math.max(D_GAMBLE_MIN, held); i < n; i++) { const g = doodleGambleGrant(s); if (g) got.push(g); }
    s.gambleGot = got;
    // Autant de tuiles nouvelles qu'il y en a déjà : le compte DOUBLE, à concurrence de la table.
    for (let i = 0, n = s.tiles.length; i < n; i++) doodleTileUnlock(s);
  } else {
    // ⚠ 12.4.6 — LA PERTE DIVISE PAR DEUX, elle n'efface plus tout (demande utilisateur). Une
    // partie d'une heure remise à zéro par un pile ou face, c'était une tuile qu'on n'avait
    // aucune raison de toucher : le pari doit coûter, pas annuler la partie.
    // ⚠ On retire la MOITIÉ DES NIVEAUX PORTÉS, tirés au hasard dans tout ce qu'on a — et non
    // la moitié de chaque compteur. C'est le miroir exact du gain, qui accorde autant d'effets
    // NEUFS qu'on en tient déjà : les deux faces se lisent alors sur la même unité, le niveau.
    // Diviser chaque compteur aurait tout de même vidé le joueur qui n'a que des effets à 1.
    // ⚠ `Math.floor` : à un seul niveau porté, on ne perd rien. C'est voulu — celui qui n'a
    // presque rien ne peut pas être « divisé par deux », et la face perdante n'est jamais
    // l'anéantissement qu'elle était.
    const unites = [], perdus = [];
    for (const pk of D_PERKS) for (let i = 0; i < s.perks[pk.k]; i++) unites.push({ icon: pk.icon, label: pk.label, take: () => { s.perks[pk.k]--; } });
    for (const l of D_LOOT) {
      if (D_LOOT_INST.has(l.k)) continue;                               // 🧴 📦 pas de niveau : rien à reprendre
      for (let i = 0; i < (s.wpn[l.k] || 0); i++) unites.push({ icon: l.icon, label: l.label, take: () => { s.wpn[l.k]--; } });
    }
    for (let n = Math.floor(unites.length / 2); n > 0; n--) {
      const u = unites.splice(Math.floor(Math.random() * unites.length), 1)[0];
      u.take(); perdus.push(`${u.icon} ${u.label}`);
    }
    // ⚠ Les trois compteurs QUI SUIVENT un butin sont recalés sur leur niveau restant, jamais
    // divisés à part : ce sont des conséquences, pas des effets. Deux divisions séparées, et
    // l'orbite aurait gardé des lames que le butin ne porte plus.
    s.armorLeft = Math.min(s.armorLeft, s.perks.armor);
    s.shTimeLeft = Math.min(s.shTimeLeft, (s.wpn.shTime || 0) * D_SHTIME);
    if (s.shur) s.shur = s.shur.slice(0, (s.wpn.shuriken || 0) * D_SHURIKEN_N);
    // … et la moitié des tuiles débloquées, puisque le gain en double le nombre.
    const tuiles0 = s.tiles.length;
    for (let n = Math.floor(tuiles0 / 2); n > 0; n--) s.tiles.splice(Math.floor(Math.random() * s.tiles.length), 1);
    if (s.tiles.indexOf('slot') < 0) s.nextSlot = null;                 // 🎰 la dalle garantie n'a plus de tuile à honorer
    s.gambleGot = perdus;
    s.gambleTiles = tuiles0 - s.tiles.length;
  }
  return win;
}
// 🕯️ Vol d'un bonus : un niveau, pris au hasard parmi tout ce qui en a. ⚠ Les BOUCLIERS et
// les munitions sont hors de portée : voler la protection ou les balles, c'est tuer à retardement
// une dalle qui, elle, ne fait aucun dégât. Renvoie le libellé volé, ou null s'il n'y avait rien.
function doodleSpiritSteal(s) {
  const pool = [];
  for (const p of D_PERKS) if (s.perks[p.k] > 0) pool.push({ icon: p.icon, label: p.label, take: () => s.perks[p.k]-- });
  for (const l of D_LOOT) {
    if (l.k === 'ammo' || l.k.startsWith('sh') || !s.wpn[l.k]) continue;
    pool.push({ icon: l.icon, label: l.label, take: () => s.wpn[l.k]-- });
  }
  if (!pool.length) return null;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  pick.take();
  return `${pick.icon} ${pick.label}`;
}
// 👥 Quatre clones, quatre couleurs, quatre trajectoires. ⚠ Ils sont DÉCORATIFS : ils ne
// touchent ni au doodler, ni aux monstres, ni aux coffres. Un clone qui pourrait pousser le
// joueur ou voler un butin transformerait une trouvaille en punition aléatoire.
// ⚠ 9.8.0 — ILS PARTENT DANS TOUS LES SENS (demande utilisateur) : plus de visée de
// plateforme, chacun s'élance sur SON angle du cercle puis rebondit — sur les bords, sur le
// plafond, sur les dalles — en repartant à chaque fois dans une direction neuve. Leur départ
// est RÉPARTI sur les 360° (i/N du tour) et non tiré au hasard : quatre tirages libres
// finissent souvent groupés du même côté, ce qui n'aurait pas montré « tous les sens ».
const D_CLONE_N = 4;
const D_CLONE_V0 = 3.4, D_CLONE_GRAV = 0.11, D_CLONE_SPREAD = Math.PI * 1.1, D_CLONE_BOUNCE = 0.86;
const D_CLONE_PAL = [
  { body:'#5cb8ef', dark:'#2f7fbf', eye:'#123a5c' },
  { body:'#e07ab8', dark:'#a8407e', eye:'#5c1a42' },
  { body:'#f0a03c', dark:'#b56a12', eye:'#5c3a08' },
  { body:'#9b7fe0', dark:'#6a4bb0', eye:'#33205c' },
];
// 🎲 Départ à 2 leurres possibles, +1 à chaque apparition. ⚠ PLAFONNÉ à 4 : au-delà, les
// dalles ne tiennent plus côte à côte sur une rangée de 340 px et se chevaucheraient, ce qui
// trahirait laquelle est la vraie. Le taux, lui, fond à chaque apparition (demande utilisateur).
// ⚠ Décroissance à 0,75 et non 0,65 : plus raide, la tuile s'éteignait pour de bon au bout
// d'une poignée d'apparitions au lieu de simplement se raréfier.
const D_RR_START = 2, D_RR_MAX = 4, D_RR_DECAY = 0.75;
// 🎯 Tolérance du « plein centre », en pixels autour du milieu de la dalle. ⚠ Large de 16 px
// sur 62 : viser reste exigeant, mais l'atterrissage n'est pas au pixel près — le doodler se
// déplace par pas de plusieurs pixels par frame, une tolérance plus fine aurait été un tirage
// au sort déguisé plutôt qu'une question d'adresse.
const D_TARGET_TOL = 8;
// 🎈 Une VARIANTE de vol, pas un mécanisme de plus : elle réutilise `fly`/`flyType`, donc elle
// hérite gratuitement de la traversée des monstres, de l'invulnérabilité de 2 s à la retombée
// et de l'annulation propre en fin d'effet. Plus lente que le chapeau : elle flotte.
// ⚠ 10.1.4 — MONTÉE RALENTIE DE 30 % (demande utilisateur) : −5,2 → −3,64. La DURÉE ne bouge
// pas, donc le ballon fait aussi monter moins HAUT (150 frames × la vitesse) — c'est la
// conséquence assumée : allonger `life` pour retrouver l'altitude d'avant aurait annulé la
// demande, le ballon serait juste devenu un vol plus long pour le même résultat.
const D_BALLOON_LIFE = 150, D_BALLOON_VY = -5.2 * 0.7;
// ⏸️ Facteur de temps des MONSTRES : 0 figé, 1 normal, 2 déchaîné. ⚠ Il vaut pour le reste de
// la partie et n'est jamais cumulé — chaque dalle pause REMPLACE le facteur précédent.
const D_FREEZE_SLOW = 0, D_FREEZE_FAST = 2;
// 🎰 Une fois DÉBLOQUÉE, la machine à sous revient d'elle-même tous les D_SLOT_STEP points
// (demande utilisateur). Le jalon est posé au déblocage, à partir du score COURANT : parti de
// zéro, il aurait rattrapé d'un coup tous les paliers déjà franchis.
const D_SLOT_STEP = 500;
// 🦘 DEUX FOIS PLUS HAUT, donc √2 fois plus vite (h ∝ v²). Écrire ×2 sur la vitesse aurait
// quadruplé la hauteur — c'est le même piège que le bonus 🦵 Ressort et le rebond de série.
const D_REBOUND_N = 3, D_REBOUND_MUL = Math.SQRT2;
// 🛗 Va-et-vient VERTICAL borné autour de sa ligne d'apparition, comme le 👁 Rôdeur. ⚠ Sans
// borne, la dalle finirait par sortir de l'écran ou par venir se coller à la rangée voisine,
// et l'écart entre deux rangées — le seul garant qu'un saut reste faisable — ne voudrait
// plus rien dire.
const D_LIFT_V = 0.9, D_LIFT_SPAN = 40;
// 🦑 9.8.7 — LE TENTACULE NE FRAPPE PLUS, IL PROJETTE (demande utilisateur) : il jaillit de la
// dalle et lance le doodler dans une direction ET avec une force tirées au sort. Le pile ou face
// mortel disparaît — la dalle n'est plus un piège, c'est une catapulte qu'on ne maîtrise pas.
// ⚠ L'éventail reste sous ±π/2 : sin(angle) demeure donc négatif et la poussée a TOUJOURS une
// composante vers le haut. Un tir vers le bas aurait été une mort déguisée, pas un imprévu.
// ⚠ La composante latérale passe par `slip` (le mécanisme de la 🧊 glace) et non par `s.vx` :
// avec le pilotage au doigt, `s.vx` est réécrit à la frame suivante et la projection latérale
// n'aurait tout simplement pas eu lieu.
// ⚠ 10.1.5 — DEUX FOIS MOINS HAUT ET PLUS AUCUNE PROTECTION (demande utilisateur). La HAUTEUR
// est halvée, donc la vitesse est divisée par √2 (h ∝ v²) : écrire ÷2 sur la vitesse aurait
// divisé la hauteur par QUATRE — même piège que le 🦘 Rebond et le bonus 🦵 Ressort.
// ⚠ Le plancher passe lui aussi par ce facteur : « deux fois moins haut qu'actuellement » vaut
// pour tous les tirages, y compris les angles couchés qui butaient sur D_JUMP.
const D_TENT_LIFE = 46, D_TENT_SPREAD = 2.5, D_TENT_V = [9, 18], D_TENT_SLIP = 22;
const D_TENT_HMUL = 1 / Math.SQRT2;
// 🪃 L'arc est décrit en OFFSET par rapport à la position courante, jamais en coordonnées
// absolues mémorisées : la caméra fait défiler les plateformes en permanence, et une position
// de départ figée ramènerait la dalle à un endroit qui n'existe plus à l'écran.
// ⚠ L'offset vaut exactement 0 au début ET à la fin du tour : le retour « à sa place » est une
// propriété de la formule, pas un recalage approché.
const D_BOOMER_DUR = 84, D_BOOMER_R = 70, D_BOOMER_H = 30;
// 🎁 9.6.1 — TUILE COFFRE (demande utilisateur) : la SEULE des nouvelles à ne pas passer par
// les paliers de 1000 points — elle tombe dès 0 point, au taux de la multicolore. Elle n'est
// donc pas dans D_TILES (la table des tuiles à débloquer) et se tire comme la 🌈, en haut du
// tirage. ⚠ Absente du mode Classique : il n'y a ni coffre ni butin là-bas.
// 🃏 TYPE EFFECTIF d'une dalle : celui du casino est celui qu'il imite. ⚠ TOUT ce qui décide
// d'un comportement doit passer par ici — létalité comprise. Un casino qui tire la 🌵 Pique
// doit tuer ; tester `p.type` le laisserait inoffensif, et la dalle mentirait sur ce qu'elle est.
function doodleEffType(p) { return p.type === 'casino' && p.roll ? p.roll : p.type === 'mimic' && p.mim ? p.mim : p.type; }
// 👻 Deux secondes de sursis avant que la dalle ne s'efface. ⚠ Le décompte vit dans `p.fade`,
// le compteur générique d'effacement d'une dalle — c'est lui que le nettoyage de fin de frame
// relit, et un compteur propre au Fantôme aurait été une chance de plus d'en oublier un.
const D_GHOST_LIFE = 120;
// 🪗 L'accordéon RETIENT le doodler pendant sa compression, puis le relâche. C'est le seul
// endroit du jeu où l'on n'est ni en saut, ni en chute, ni en vol — d'où l'état `s.acc`.
// ⚠ La détente vaut 1,75 fois la vitesse d'un saut, soit ~3 fois sa HAUTEUR (h ∝ v²). Le prix
// en est la pause : sans elle, la tuile serait un trampoline gratuit et rendrait le ressort inutile.
const D_ACCORD_HOLD = 14, D_ACCORD_MUL = 1.75;
// 👹 Hauteur d'apparition du monstre appelé par le générateur, au-dessus du doodler.
// ⚠ Jamais moins de D_SPAWNER_MIN : un monstre lâché sur la tête serait une mort sans geste
// possible, alors que la dalle doit poser un problème, pas le trancher à notre place.
const D_SPAWNER_MIN = 95, D_SPAWNER_SPAN = 150;
const D_ZAP_CYCLE = 120, D_ZAP_ON = 34;        // ⚡ décharge toutes les 2 s, active ~0,55 s
// 📡 10.1.9 — ARC ÉLECTRIQUE (demande utilisateur) : la dalle porte une antenne et ne fait RIEN
// toute seule — il en faut DEUX à l'écran pour qu'un arc se tende entre elles.
// ⚠ Cycle GLOBAL (lu sur `s.tw`, pas sur une phase par dalle) : tous les arcs de l'écran
// crépitent ensemble. Des phases décalées auraient donné un rideau permanent d'éclairs entre
// lesquels plus aucune fenêtre sûre n'existait.
// ⚠ 10.6.3 — PORTÉE ÉLARGIE de 190 à 290 px (demande utilisateur) : à 190, deux antennes ne se
// répondaient qu'en se touchant presque, et la tuile ne se déclenchait quasiment jamais.
// ⚠ Elle reste BORNÉE, mais elle dépasse désormais l'écart maximal de deux antennes d'une même
// rangée (266 px) : une rangée PEUT donc être barrée de bout en bout, ce que l'ancien réglage
// interdisait. Ce qui l'empêche d'être un mur, c'est le CYCLE — l'arc n'est allumé que
// D_ARC_ON frames sur D_ARC_CYCLE, il y a toujours une fenêtre pour passer —, le fait qu'il
// BLESSE (`doodleHurt`) au lieu de tuer sec (un bouclier le pare), et depuis 11.2.9 le fait que
// ses deux PIEDS soient hors de danger : une antenne reste une dalle où l'on se pose.
// ⚠ L'arc BLESSE via `doodleHurt` (jamais une mort sèche) : il est donc paré par les boucliers,
// comme la ⚡ Électrifiée et le ⚙️ Piège à picots dont il reprend la grammaire.
// ⚠ 11.2.9 — SEUL L'ARC TUE, PAS LE PIED DE L'ANTENNE (demande utilisateur). L'éclair part
// du HAUT du mât, soit 9 px au-dessus du dos de la dalle — exactement là où se trouve le
// doodler quand il rebondit sur cette dalle-là. Il mourait donc en se posant sur une
// antenne, sans avoir traversé quoi que ce soit. `D_ARC_FOOT` écarte du calcul de dégâts
// la portion d'arc qui SURPLOMBE une antenne (demi-dalle + une marge) : ce qui blesse,
// c'est la travée tendue entre les deux mâts, jamais leur base.
// ⚠ Le DESSIN, lui, n'est pas touché : l'éclair se voit toujours en entier, d'un mât à
// l'autre. Le raccourcir aurait donné un arc coupé en deux, illisible.
const D_ARC_CYCLE = 130, D_ARC_ON = 42, D_ARC_RANGE = 290, D_ARC_HIT = 9;
const D_ARC_FOOT = D_PLAT_W / 2 + 4;   // 35 px : la demi-dalle, plus de quoi couvrir ses bords
function doodleArcOn(t) { return (t % D_ARC_CYCLE) < D_ARC_ON; }
// Les segments d'arc à l'écran : toutes les paires d'antennes visibles à portée l'une de
// l'autre. ⚠ Une seule source pour le DESSIN et pour les dégâts — deux parcours séparés, et
// c'était la garantie qu'un éclair dessiné finisse par ne pas être celui qui blesse.
function doodleArcPairs(s, H) {
  const a = [];
  for (const q of s.platforms) if (doodleEffType(q) === 'arc' && !q.dead && q.y > -20 && q.y < H + 20) a.push(q);
  const out = [];
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
    const x1 = a[i].x + a[i].w / 2, y1 = a[i].y, x2 = a[j].x + a[j].w / 2, y2 = a[j].y;
    if (Math.hypot(x2 - x1, y2 - y1) > D_ARC_RANGE) continue;
    out.push({ x1, y1: y1 - 9, x2, y2: y2 - 9 });   // −9 : l'arc part du HAUT de l'antenne, pas de la dalle
  }
  return out;
}
// Distance d'un point au SEGMENT (et non à la droite) : au-delà des antennes, l'arc n'existe pas.
function doodleSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const u = l2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
  return Math.hypot(px - (x1 + u * dx), py - (y1 + u * dy));
}
// ➡️ 9.5.0 — TAPIS ROULANT DURCI (demande utilisateur) : il ne suffisait plus de dériver
// 0,7 s. L'entraînement dure maintenant D_BELT_LIFE (3 s) ET le doodler n'obéit plus qu'à
// D_BELT_GRIP de son pilotage pendant ce temps — c'est ce qui rend « difficile de venir là
// où il y a mon doigt ». ⚠ Le contrôle est BRIDÉ, jamais coupé : une tuile qui retire toute
// prise pendant 3 s ne serait plus un obstacle mais une mort différée.
// ⚠ 9.8.1 — « il ne se passe rien » (demande utilisateur) : l'entraînement était réel mais
// INVISIBLE — 2 px/frame se confondaient avec le pilotage, et rien à l'écran ne disait qu'on
// dérivait. Trois changements, dans cet ordre : la dérive passe à D_BELT_V (bien au-delà du
// bruit du doigt), l'adhérence tombe à D_BELT_GRIP, et surtout la dérive se VOIT — chevrons
// de vitesse derrière le doodler, traînée de poussière au sol et pastille de décompte au HUD.
// 💫 10.1.8 — ATTRACTION GRAVITATIONNELLE (demande utilisateur), tuile du biome Cosmos en
// 🟦 12.5.6 — « SAUVÉ PAR LE TARDIS » remplace l'💫 Attraction gravitationnelle (demande
// utilisateur). La tuile rare du 🌌 Cosmos ne tire plus le doodler : elle l'EMBARQUE.
// Le rebond appelle la cabine bleue, qui arrive par un côté à la hauteur de la dalle, s'ouvre,
// referme ses portes sur le doodler, monte à la verticale, puis le repose sur la PROCHAINE
// tuile TARDIS — ou, si l'on a quitté le biome entre-temps, sur la première dalle venue.
// ⚠ C'est un ÉTAT EXCLUSIF (`s.tardis`), au même rang que la 🌿 Liane et le 🌳 Arbre : pendant
// le voyage on n'est ni en saut, ni en chute, ni en vol, et les dangers ne mordent pas — la
// tuile promet un SAUVETAGE, un monstre qui tuerait à travers la coque l'aurait démentie.
// ⚠ Quatre phases, et un `p.tar` qui n'autorise qu'un embarquement par dalle : sans lui, se
// reposer sur la même tuile relançait le voyage à l'infini.
//   'come' la cabine glisse depuis un bord, à la hauteur de la dalle de départ
//   'load' les portes s'ouvrent, le doodler entre (il n'est plus dessiné)
//   'rise' la montée verticale, le temps de trouver une destination
//   'drop' les portes s'ouvrent au-dessus de la dalle d'arrivée et le déposent
// ⚠ La MONTÉE passe par `s.vy` et non par `s.py` : seule une vitesse négative fait défiler la
// caméra (voir la boucle « caméra »), et poser la position aurait sorti le doodler du cadre
// sans que le monde bouge — c'est exactement le piège déjà documenté sur le 🌳 Arbre géant.
// ⚠ Le voyage est PLAFONNÉ (D_TARDIS_MAX) : sans borne, un joueur qui ne recroise jamais de
// tuile TARDIS avant le palier suivant serait monté indéfiniment. Au plafond, la cabine se pose
// sur la dalle suivante comme si l'on avait changé de biome.
// ⚠ La destination est la dalle la plus BASSE parmi celles qui sont AU-DESSUS des pieds : c'est
// « la prochaine », et la cabine n'a donc jamais à redescendre pour déposer.
const D_TARDIS_W = 30, D_TARDIS_H = 48;   // la cabine, un peu plus haute que large
const D_TARDIS_IN = 5.2;                  // vitesse d'arrivée latérale, px/frame
const D_TARDIS_V = 3.0;                   // vitesse de montée, px/frame (~180 px/s)
const D_TARDIS_LOAD = 34, D_TARDIS_DROP = 42;   // frames d'ouverture des portes, à l'aller et au retour
const D_TARDIS_MAX = 300;                 // garde-fou : 5 s de montée au plus, soit ~900 px
// La dalle d'arrivée : la plus BASSE de celles qui sont au-dessus des pieds du doodler.
// ⚠ `onlyTardis` restreint aux tuiles TARDIS (hors celle de départ) tant qu'on est dans le
// biome ; une fois sorti — ou au plafond — n'importe quelle dalle solide fait l'affaire.
function doodleTardisTarget(s, onlyTardis, from) {
  let best = null;
  for (const q of s.platforms) {
    if (q === from || q.dead || !doodleSolid(q) || q.y >= s.py + D_FEET - 6) continue;
    if (onlyTardis && doodleEffType(q) !== 'tardis') continue;
    if (!best || q.y > best.y) best = q;
  }
  return best;
}
const D_BELT_LIFE_S = 3;                       // ➡️ durée de l'entraînement, en SECONDES réelles
const D_BELT_V = 3.3, D_BELT_LIFE = D_BELT_LIFE_S * 60, D_BELT_GRIP = 0.3;
const D_STEER_V = 7.2;                         // pas maximal du pilotage au doigt, en px/frame
const D_TMAGNET_R = 150, D_TMAGNET_V = 3.2;    // 🧲 rayon d'attraction et vitesse
const D_SLOW_LIFE = 600, D_SLOW = 0.55;        // ⏱️ 10 s à 60 fps, tout tourne à 55 % de vitesse
// ⚠ 9.4.2 — Deux réglages de la même demande, appliqués dans l'ordre reçu :
//   · −25 % sur la bande des tuiles débloquées ET sur les monstres ;
//   · puis +10 % sur les tuiles à partir de 500 points, +20 % au-delà de 1000.
// Résultat net sur les tuiles : ×0,825 vers 500 points, ×0,90 au-delà de 1000 — un peu moins
// qu'avant, mais bien plus qu'un simple quart en moins.
// ⚠ 9.5.3 — +10 % sur la bande des tuiles débloquées (demande utilisateur).
const D_TILE_P = 0.16 * 0.75 * 1.10;   // largeur de la bande de tirage réservée aux tuiles débloquées
const D_MOB_LESS = 0.75;        // −25 % de monstres
// 👾 Taux de monstres par rangée : plancher au départ, plus D_MOB_P_RAMP au prorata de `diff`.
// ⚠ 10.0.2 — +1 POINT DE POURCENTAGE sur le plancher (demande utilisateur), ajouté EN CLAIR.
// ⚠ Extrait en constantes parce que le récapitulatif des probabilités (onglet Stats) recopiait
// les mêmes nombres à la main : les deux ne peuvent plus diverger.
const D_MOB_P0 = 0.02 + 0.01, D_MOB_P_RAMP = 0.10;
function doodleTileBand(score) { return D_TILE_P * (score >= 1000 ? 1.2 : score >= 500 ? 1.1 : 1); }
// ⚠ 9.2.7 — Le bonus de palier n'est plus un BLOC qui flotte au-dessus de la rangée mais une
// CASE sur laquelle on REBOND (demande utilisateur) : impossible à manquer, et elle occupe la
// rangée au lieu de s'y superposer. Elle s'ouvre au premier rebond puis redevient une
// plateforme verte ordinaire — sinon on la ferait rendre à l'infini en rebondissant dessus.
// ⚠ 10.0.6 — LA CASE CHANCE EST COUPÉE EN DEUX (demande utilisateur) : 🍀 la case chance ne
// donne plus QUE des bonus (elle ne tire plus de malus du tout), et ☠️ la CASE MALCHANCE,
// nouvelle, ne donne QUE des malus. Elles ont le MÊME taux (`D_LUCKY_P`), les MÊMES garde-fous
// (`D_LUCKY_MAX` par partie, `D_LUCKY_GAP` points d'écart) mais des COMPTEURS SÉPARÉS
// (`luckyLeft`/`luckyAt` vs `unluckyLeft`/`unluckyAt`) : partagés, l'une aurait mangé les
// apparitions de l'autre. Seul le DESSIN les distingue à l'écran (irisé clair vs cramoisi
// sombre) — d'où deux palettes bien tranchées dans `doodleCase`.
// ⚠ Les DEUX restent TRÈS TRÈS RARES et bornées deux fois (3 par partie MAXIMUM chacune,
// jamais deux à moins de 500 points d'écart), parce qu'un malus subi en boucle serait juste
// punitif.
// ⚠ D_LUCKY_P est calibrée POUR le garde-fou des 500 points, pas indépendamment de lui : à
// ~85 rangées par fenêtre de 500 points, 0,0012 par rangée donne ~10 % de chances d'en voir
// une par fenêtre, soit environ UNE par partie de 5000 points — les 3 restent exceptionnelles.
// ⚠ 9.9.2 — +20 % SUR LE TAUX DE LA CASE CHANCE (demande utilisateur) : 0,0012 → 0,00144 par
// rangée. Le facteur est écrit EN CLAIR dans la formule plutôt que fondu dans une nouvelle
// valeur : c'est ce qui garde lisible d'où vient le nombre, et la calibration d'origine
// (~10 % de chances d'en voir une par fenêtre de 500 points) reste vérifiable.
// ⚠ 10.0.2 — +1 POINT DE POURCENTAGE (demande utilisateur) : le terme est ajouté EN CLAIR à la
// fin de la formule, comme le facteur ×1,20 avant lui, pour que la calibration d'origine reste
// lisible. La case chance passe ainsi de ~10 % à ~60 % de chances d'apparaître par fenêtre de
// 500 points : elle se voit enfin, sans devenir courante pour autant.
// ⚠ 10.0.5 — −30 % (demande utilisateur) : le facteur s'applique à TOUTE la formule, et donc
// aussi à la 💀 case cauchemardesque, qui partage ce taux. Comme les deux ajustements
// précédents, il est écrit EN CLAIR au lieu d'être fondu dans une nouvelle valeur.
// ⚠ Les deux garde-fous ne bougent pas : 3 par partie au maximum, 500 points d'écart minimum.
// Ce sont eux qui empêchent qu'un malus soit subi en boucle, pas le taux — et c'est pour ça
// qu'on peut régler celui-ci sans qu'un malus puisse être subi en boucle.
const D_LUCKY_MAX = 3, D_LUCKY_GAP = 500, D_LUCKY_P = (0.0012 * 1.20 + 0.01) * 0.70;
const D_MALUS = [
  { k: 'mrev',   icon: '🌀', label: 'Vertige',    txt: 'commandes inversées' },
  { k: 'mheavy', icon: '🪨', label: 'Plomb',      txt: 'saut alourdi' },
  { k: 'mfog',   icon: '🌫️', label: 'Brouillard', txt: 'visibilité réduite' },
  { k: 'jam',    icon: '🔧', label: 'Enrayé',     txt: '−15 munitions' },
  { k: 'ambush', icon: '👹', label: 'Embuscade',  txt: 'deux monstres surgissent' },
];
const D_MALUS_LIFE = 380;       // ~6 s pour les malus à durée ; les deux autres sont instantanés
const D_BANNER_LIFE = 130;      // ~2 s d'annonce de biome
const D_HEAVY = 0.88;           // 🪨 facteur appliqué à la vitesse de saut
const D_JAM = 15;               // 🔧 munitions perdues
// ⚠ 9.2.8 — BIOMES (demande utilisateur) : le décor change tous les 1000 points d'altitude,
// même cadence que les bonus et les tuiles débloquées. Chaque biome apporte SES tuiles (peu
// courantes, ~6 % des rangées à se partager) et SES deux créatures — une peu rare, une très
// rare.
// ⚠ Chaque palier RETIRE au hasard l'un des biomes thématiques, jamais deux fois le même de
// suite : la montée n'a pas de fin et le décor non plus.
const D_BIOME_STEP = 1000;
// ⚠ 9.4.5 — AUCUN biome thématique avant 1000 points (demande utilisateur) : la première
// tranche est le décor NORMAL, celui du jeu d'origine, sans créature ni tuile propres. Ensuite,
// chaque palier en tire un AU HASARD (voir `doodleBiomeRoll`) — l'ordre n'est plus fixe.
// ⚠ `mobs: []` et `tiles: []` sur le biome normal : tout le code de biome doit donc tolérer
// l'absence de créature et de tuile, et c'est ce qui rend la première tranche identique à
// l'ancien jeu.
// 🌨️ 9.9.5 puis 10.8.2 — LE GEL DES BONUS : d'abord porté par la ❄️ Bourrasque, il est depuis
// 10.8.2 le seul effet de la 🌨️ Congère. S'y poser suspend, pendant D_FROST_LIFE frames, tous
// les bonus permanents (D_PERKS) et toutes les améliorations d'arme. Rien n'est effacé — tout revient intact au dégel.
// ⚠ Les BOUCLIERS et la carapace sont volontairement épargnés : ce sont des protections
// consommables, pas des bonus, et les geler aurait transformé une dalle qu'on prend souvent
// par accident en condamnation à mort. Ce que le gel enlève, c'est la puissance, pas la survie.
// ⚠ Tous les points d'usage passent par `doodlePerkOf`/`doodleWpnOf` : lire `s.perks.x`
// directement quelque part, c'est garantir qu'un bonus reste actif pendant le gel.
const D_FROST_LIFE = 600;
function doodleFrozen(s) { return (s.frost || 0) > 0; }
function doodlePerkOf(s, k) { return doodleFrozen(s) ? 0 : (s.perks[k] || 0); }
function doodleWpnOf(s, k) { return doodleFrozen(s) ? 0 : ((s.wpn && s.wpn[k]) || 0); }
// 𓂀 10.8.1 — LA STÈLE D'ÉGYPTE (demande utilisateur) : le rebond ouvre la dalle et lâche
// D_MUM_N momies (cinq depuis 11.1.8), qui TOMBENT. Celle qui rencontre une plateforme s'y pose et devient une
// vraie créature, mortelle comme les autres ; celle qui ne rencontre rien sort par le bas.
// ⚠ C'est le SEUL moyen du jeu de fabriquer un monstre à partir d'un objet en chute : elles
// vivent dans `s.mums` jusqu'à l'atterrissage, et seulement alors passent dans `s.monsters`.
// Les créer monstres tout de suite les aurait rendues mortelles pendant leur chute, alors que
// la tuile promet qu'on peut les regarder passer.
// ⚠ Une seule fois par dalle (`p.mum`) : revenir dessus en boucle aurait fabriqué une armée.
const D_MUM_N = 5, D_MUM_G = 0.24, D_MUM_VMAX = 6.2, D_MUM_W = 34, D_MUM_H = 40;
// ⚠ 10.9.9 — LES MOMIES TOMBENT DU CIEL (demande utilisateur) : elles ne sortent plus de la
// dalle, elles apparaissent AU-DESSUS de l'écran à une abscisse tirée au sort et traversent
// toute la hauteur, exactement comme la ☄️ Météorite. La stèle ne les contient plus, elle les
// APPELLE — et c'est ce qui rend le danger lisible : on les voit venir de loin.
// ⚠ Elles descendent DÉCALÉES (`D_MUM_STAGGER`) : nées à la même hauteur, elles arrivaient
// ensemble et l'on ne voyait qu'un seul événement au lieu de D_MUM_N.
// ⚠ Aucune dérive latérale, comme la météorite : elles tombent droit. C'est ce qui permet de
// lire, dès leur apparition, la colonne où elles vont atterrir.
const D_MUM_V0 = 1.6, D_MUM_STAGGER = 90;
// ⚠ 11.1.8 — UN SEUL coffre par momie abattue (demande utilisateur), contre deux jusqu'ici : la
// stèle en appelle désormais cinq, le butin total monte quand même. Le champ est LU par
// `doodleKillMonster`, qui dérive l'étalement des coffres du nombre — rien à recopier ici.
const D_MUM_LOOT = 1;
// 🧊 10.8.2 — LA STALACTITE (demande utilisateur, biome Glacier) : trois piques de glace
// pendent sous la dalle ; s'y poser les DÉCROCHE. Elles tombent tout droit et emportent dans
// le vide tout ce qu'elles rencontrent en dessous — plateformes comme créatures.
// ⚠ Une plateforme touchée n'est pas SUPPRIMÉE, elle DÉCROCHE (`p.fvy`) et tombe : effacée
// d'un coup, la colonne se serait vidée sans qu'on comprenne pourquoi. On doit voir tomber.
// ⚠ Les piques tombent VERS LE BAS, donc derrière le joueur qui monte : la tuile ne peut pas
// se retourner contre lui, et c'est voulu — c'est une tuile qu'on prend sans risque immédiat,
// dont on paie le prix seulement si l'on redescend.
// ⚠ Une seule fois par dalle (`p.stal`) : des piques repoussant à chaque passage auraient fait
// de la dalle un raseur permanent de la colonne.
// ⚠ 10.10.5 — LE TIR ET LE REBOND NE FONT PLUS LA MÊME CHOSE (demande utilisateur).
//   • REBOND : les piques restantes décrochent TOUTES, et chacune rase la colonne entière —
//     tout ce qu'elle rencontre en tombant part dans le vide. C'est la tuile telle qu'elle était.
//   • TIR : il faut D_STAL_SHOTS balles pour décrocher UNE pique, soit 9 pour les trois, et une
//     pique tombée au tir n'emporte QU'UNE dalle avant de se briser.
// ⚠ La différence tient en un seul champ porté par la pique, `take` : le nombre de dalles
// qu'elle peut encore emporter. `Infinity` pour le rebond, 1 pour le tir — et `--st.take`
// laisse Infinity intact, donc un seul test suffit pour les deux cas.
// ⚠ `p.stalLeft` compte les piques ENCORE PENDUES et c'est lui qui décide du dessin : sans
// lui, une dalle à moitié vidée aurait continué d'afficher ses trois piques.
const D_STAL_N = 3, D_STAL_G = 0.34, D_STAL_VMAX = 9.5, D_STAL_W = 9, D_STAL_H = 17;
const D_STAL_SHOTS = 3;
const D_PLAT_FALL_G = 0.42, D_PLAT_FALL_VMAX = 11;
// Décroche `n` piques de la dalle (au plus ce qu'il en reste), chacune autorisée à emporter
// `take` dalles. Renvoie le nombre réellement parti.
// ⚠ Les piques partent DE GAUCHE À DROITE, dans l'ordre où le dessin les montre : tirer au
// hasard aurait fait disparaître une pique là où on n'avait pas visé.
function doodleStalDrop(s, p, n, take) {
  s.stals = s.stals || [];
  const left = p.stalLeft == null ? D_STAL_N : p.stalLeft;
  const k = Math.max(0, Math.min(n, left));
  for (let j = 0; j < k; j++) {
    const i = D_STAL_N - left + j;
    s.stals.push({ x: p.x + (i + 0.5) * p.w / D_STAL_N - D_STAL_W / 2, y: p.y + p.h,
                   w: D_STAL_W, h: D_STAL_H, vy: 1.2 + i * 0.25, take: take });
  }
  p.stalLeft = left - k;
  if (p.stalLeft <= 0) p.stal = true;   // la dalle est vidée : elle ne mange plus les balles
  return k;
}
function doodleMumDrop(s, W) {
  s.mums = s.mums || [];
  for (let i = 0; i < D_MUM_N; i++) {
    s.mums.push({ x: 12 + Math.random() * Math.max(1, W - D_MUM_W - 24), y: -D_MUM_H - 12 - i * D_MUM_STAGGER,
                  w: D_MUM_W, h: D_MUM_H, vx: 0, vy: D_MUM_V0, wt: Math.random() * 6.28 });
  }
}
// La momie posée : une créature ORDINAIRE (elle tue au contact, elle meurt d'une balle, elle
// lâche son coffre) qui reste sur SA dalle grâce à `perch`, comme le 🪨 Caillasseur.
function doodleMumSettle(s, mu, pl) {
  s.monsters.push({ x: mu.x, y: pl.y - D_MUM_H, w: D_MUM_W, h: D_MUM_H, type: 1, alive: true,
                    kind: 'mummy', icon: '𓁿', perch: pl, loot: D_MUM_LOOT, vx: 0, wt: 0, y0: pl.y - D_MUM_H });
}
// ☁️ 10.10.8 — BIOME NUAGES (demande utilisateur) : le plein ciel. Il reprend la ☁️ Nuage, qui
// quitte D_TILES pour de bon, et apporte deux tuiles neuves — la girouette et l'orage — plus
// deux créatures angéliques. (L'🌈 Arc-en-ciel y est née en 10.10.8 puis en est repartie en
// 10.11.0 : c'est une tuile bonus.)
// 🌬️ LA GIROUETTE (« direction du vent ») : elle naît tournée vers l'un des quatre points
// cardinaux et souffle tant qu'elle est À L'ÉCRAN. Toutes les D_GALE_EVERY frames elle pousse
// TOUTES les plateformes de D_GALE_PUSH px dans son sens, et le vent qu'elle lève infléchit
// aussi le doodler : une dérive latérale continue, et un saut un peu plus haut quand le vent
// monte, un peu plus court quand il descend.
// ⚠ La poussée s'applique aux DALLES, jamais à la caméra ni au score : déplacer le monde entier
// aurait fait bouger l'altitude, dont dépendent les paliers de bonus, de tuiles et de biome.
// ⚠ Les dalles poussées restent DANS l'écran (bornage en x) : sorties par le bord, elles
// auraient laissé des rangées vides, donc infranchissables.
// ⚠ Ce qui est PORTÉ par une dalle suit la poussée — l'axe de course de l'🛗 Ascenseur et de la
// 🐛 Buguée (`y0`), l'ancre de la 👀 Vivante (`ax`/`ay`) et les 📦 coffres posés dessus. Sans
// ça, le premier sortait de sa ligne et les seconds restaient suspendus dans le vide.
// ⚠ 12.5.9 — LE VENT NE SE LÈVE PLUS TOUT SEUL (demande utilisateur) : la girouette ne souffle
// plus « tant qu'elle est à l'écran », elle souffle D_GALE_LIFE frames À PARTIR DU MOMENT OÙ
// L'ON MARCHE DESSUS, et pas une de plus.
// ⚠ Le vent vit désormais sur la PARTIE (`s.galeWind`) et non sur la dalle : une bourrasque
// portée par la dalle se serait arrêtée net à l'instant où celle-ci sort par le bas de l'écran
// et quitte `s.platforms` — or les dix secondes sont promises au joueur, pas à la plateforme.
// ⚠ Une seule bourrasque à la fois : marcher sur une deuxième girouette REMPLACE la première
// (nouveau sens, décompte remis à neuf). Les additionner aurait rendu le sens illisible, et
// c'est précisément ce que l'ancien cumul « toutes les girouettes visibles » faisait de pire.
// ⚠ Elle tombe toujours au CHANGEMENT DE BIOME : le palier est mémorisé au départ.
const D_GALE_LIFE = 600;                        // 10 s de bourrasque
const D_GALE_EVERY = 60, D_GALE_PUSH = 3;       // … et 3 px de poussée par seconde
const D_GALE_DRIFT = 0.22;     // dérive latérale imprimée au doodler, px/frame
const D_GALE_JUMP = 0.09;      // ± de HAUTEUR de saut, selon que le vent monte ou descend
const D_GALE_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // ↑ → ↓ ← , dans l'ordre des quarts de tour
// 🌬️ 10.11.0 — LE VENT SE VOIT (demande utilisateur) : tant que l'effet dure, des filets d'air
// balaient TOUT L'ÉCRAN dans le sens du vent. ⚠ Ils sont DÉTERMINISTES (doodleRnd + s.t), comme
// les grains de la 🏜️ tempête de sable : une gerbe de vraies particules aurait saturé `parts`
// pendant toute la durée de l'effet, qui n'a pas de fin programmée.
// ⚠ Le voile monte et redescend en fondu (D_GALE_FADE_IN/OUT) : apparu et disparu d'un coup, on
// n'aurait pas relié ce qui bouge à l'écran à la girouette qui entre ou sort du cadre.
const D_GALE_STREAKS = 32;
const D_GALE_FADE_IN = 0.035, D_GALE_FADE_OUT = 0.022;
function doodleGalePush(s, dx, dy, W) {
  for (const q of s.platforms) {
    if (q.dead) continue;
    const nx = Math.max(2, Math.min(W - q.w - 2, q.x + dx)), mx = nx - q.x;
    q.x = nx; q.y += dy;
    if (q.y0 != null) q.y0 += dy;                     // 🛗 🐛 l'axe de la course verticale suit
    if (q.ay != null) { q.ax += mx; q.ay += dy; }     // 👀 l'ancre de la Vivante aussi
    for (const c of s.chests) if (c.plat === q) { c.x += mx; c.y += dy; }
  }
}
// ⛈️ L'ORAGE : toutes les D_STORM_EVERY frames, la dalle foudroie ce qu'il y a de plus PROCHE
// d'elle — mais uniquement PLUS BAS qu'elle (sa propre rangée est exclue). Une plateforme
// frappée DÉCROCHE et tombe (`fvy`, comme sous une 🧊 Stalactite) ; le doodler frappé encaisse.
// ⚠ L'🧤 Immunité électrique le sauve, exactement comme sur une ⚡ Électrifiée : c'est la même
// foudre, il aurait été incompréhensible qu'elle protège d'une dalle et pas de l'autre.
// ⚠ Elle ne frappe que si elle est À L'ÉCRAN : sortie par le bas, elle aurait continué de
// foudroyer un joueur qui ne pouvait ni la voir venir ni la fuir.
const D_STORM_EVERY = 300, D_STORM_LIFE = 26;
const D_STORM_DROPS = 12;      // gouttes dessinées sous la dalle (voir doodleTileDraw)
// ⚠ 11.1.7 — TOUTES LES TUILES D'UN BIOME NE SE VALENT PLUS (demande utilisateur) : huit d'entre
// elles — une par biome, les plus lourdes de conséquences — apparaissent 60 % moins souvent.
// C'est le champ `w` de la tuile, et lui seul ; le filtre est appliqué APRÈS le tirage uniforme
// (voir `doodleSpawnRow`), si bien que les deux autres tuiles du biome gardent EXACTEMENT le
// taux qu'elles avaient — la part perdue retombe en plateforme ordinaire, elle n'est pas
// redistribuée.
// ⚠ Le VESTIGE garde sa part fixe (D_RELIC_SHARE) : c'est déjà la tuile la plus rare du palier,
// la pondérer une seconde fois l'aurait rendue invisible.
// ⚠ 11.2.3 — ENCORE DIVISÉ PAR 3 (demande utilisateur) : 0,4 → ~0,133. La tuile rare d'un
// biome n'est donc retenue qu'une fois sur 7,5 tirages qui la désignent, contre une sur 2,5.
// Écrit `0.4 / 3` et non la décimale : la valeur d'origine et le facteur restent lisibles.
const D_BIOME_TILE_RARE = 0.4 / 3;   // poids d'une tuile « rare » : ~87 % de moins qu'une tuile ordinaire
function doodleBiomeTileW(k) { const d = doodleBiomeTileDef(k); return (d && d.w) || 1; }
// 🔥 12.5.7 — BIOME ENFER (demande utilisateur). Trois tuiles, et chacune répond à une
// question que les autres biomes ne posaient pas :
// ⛓️ LA CHAÎNE naît TOUJOURS PAR DEUX, à des hauteurs différentes, et une chaîne PEND entre
//   les deux (d'où la flèche : elle est soumise à la gravité, comme une vraie chaîne lâche).
//   Se poser sur la dalle BASSE, c'est la gravir jusqu'à la HAUTE — un ascenseur qu'on grimpe,
//   pas un tremplin. ⚠ La jumelle naît EN DESSOUS, jamais au-dessus : posée plus haut, elle
//   abaisserait `topY` et la boucle de génération croirait la rangée suivante déjà faite,
//   ouvrant un trou infranchissable (même piège que les 🚇 Tuyaux).
//   ⚠ L'écart horizontal est BORNÉ (D_CHAIN_MAXX) : deux pieds aux antipodes auraient donné une
//   chaîne presque horizontale, qu'on ne lit plus comme quelque chose qui se grimpe.
// 🦴 L'OSSUAIRE crache un squelette D_SKEL_FIRST frames après son entrée à l'écran, puis un
//   toutes les D_SKEL_EVERY frames. Le squelette est la SEULE créature du jeu soumise à la
//   gravité : il tombe, se pose sur ce qu'il rencontre et marche vers le doodler. ⚠ Et il ne
//   meurt pas vraiment — abattu, il s'effondre en tas d'os, attend D_SKEL_DOWN puis se
//   reconstruit en D_SKEL_REBUILD. C'est pourquoi il ne lâche AUCUN coffre : sans cette règle,
//   une dalle d'ossuaire aurait été une machine à butin qu'il suffisait d'arroser.
//   ⚠ 12.8.0 — UNE SECONDE DE PLUS PARTOUT ET 20 % DE VITESSE EN MOINS (demande utilisateur) :
//   la dalle crachait son premier squelette à l'instant même où on la découvrait, sans laisser
//   le temps de la lire, et les suivants se relevaient trop vite pour qu'abattre serve à
//   quelque chose. Le délai d'apparition, celui de reconstruction et l'allure de marche sont
//   réglés par ces quatre constantes — rien n'est écrit en dur ailleurs.
// 🔥 LA FLAMME ÉTERNELLE (tuile rare) est une coulée de magma à ciel ouvert :
//   • une créature qui la touche brûle sur place ;
//   • une balle tirée dedans est ABSORBÉE — on ne l'éteint pas ;
//   • s'y poser arme les D_FLAME_SHOTS tirs suivants en LANCE-FLAMMES.
//   Un tir de lance-flammes qui rencontre une dalle en EMBRASE LE SOMMET pour D_BURN_LIFE
//   frames, et ce sommet détruit tout ce qu'il touche — les créatures, et toi aussi.
//   ⚠ C'est volontaire : l'arme est puissante, elle doit se payer. Le brasier est parfaitement
//   visible, donc évitable — c'est un risque qu'on prend, pas un piège qu'on subit. Le doodler
//   passe par `doodleHurt` comme partout : boucliers et teintes gardent leur mot à dire.
//   ⚠ Se tenir sur la coulée elle-même ne risque RIEN, comme sur la 🔥 Magma du Volcan : il
//   faut bien pouvoir y prendre le lance-flammes.
const D_CHAIN_DY = [72, 124];        // écart vertical entre les deux dalles d'une paire
const D_CHAIN_MAXX = 120;            // … et écart horizontal maximal
const D_CHAIN_SAG = 24;              // flèche de la chaîne : ce qui la fait pendre
const D_CHAIN_V = 0.0165;            // vitesse de montée, en fraction de chaîne par frame (~1 s)
const D_SKEL_EVERY = 360;            // un squelette toutes les 6 s
const D_SKEL_FIRST = 60;             // … et 1 s de répit avant le tout premier
const D_SKEL_G = 0.34, D_SKEL_VMAX = 8.5;
const D_SKEL_VX = 0.76;              // il marche vers le doodler, au sol seulement (0,95 − 20 %)
const D_SKEL_W = 32, D_SKEL_H = 38;
const D_SKEL_DOWN = 120, D_SKEL_REBUILD = 180;   // 2 s en tas d'os, puis 3 s à se reconstruire
const D_SKEL_MAX = 8;                // plafond global : aucun squelette ne meurt vraiment, il en faut un
const D_FLAME_SHOTS = 3;
const D_BURN_LIFE = 300, D_BURN_H = 12;          // 5 s d'embrasement, sur D_BURN_H px au-dessus de la dalle
// Les liaisons tendues à l'écran : une entrée par PAIRE, de la dalle HAUTE vers la BASSE.
// ⚠ GÉNÉRIQUE, indexée par le champ qui porte l'identifiant de paire (`chain` pour la ⛓️ Chaîne
// de l'Enfer, `ladder` pour la 🪜 Échelle de la Prison) : les deux tuiles sont le même mécanisme
// à la flèche près, et les écrire deux fois, c'était garantir qu'elles finissent par diverger.
// ⚠ Source UNIQUE pour le dessin et pour la montée : deux parcours séparés, et l'on finirait
// par grimper une liaison qui n'est pas celle qu'on voit.
function doodleClimbPairs(s, champ) {
  const by = new Map();
  for (const q of s.platforms) {
    if (!q[champ] || q.dead) continue;
    const l = by.get(q[champ]) || []; l.push(q); by.set(q[champ], l);
  }
  const out = [];
  for (const l of by.values()) {
    if (l.length < 2) continue;
    const [a, b] = l[0].y <= l[1].y ? [l[0], l[1]] : [l[1], l[0]];   // a = haute, b = basse
    out.push({ a, b, k: champ, x1: a.x + a.w / 2, y1: a.y + a.h, x2: b.x + b.w / 2, y2: b.y });
  }
  return out;
}
// Toutes les liaisons, les deux sortes confondues — ce que le dessin et la recherche de paire
// veulent presque toujours.
function doodleClimbAll(s) { return doodleClimbPairs(s, 'chain').concat(doodleClimbPairs(s, 'ladder')); }
// Point de la liaison à l'avancement `u` (0 = sous la dalle haute, 1 = sur la dalle basse).
// ⚠ La CHAÎNE pend (D_CHAIN_SAG) : sans la flèche, deux dalles reliées par un trait droit
// n'auraient rien d'une chaîne lâche, et « soumise à la gravité » n'aurait pas été tenu.
// L'ÉCHELLE, elle, est rigide : flèche nulle, sinon ce serait une corde.
function doodleClimbAt(c, u) {
  const sag = c.k === 'chain' ? D_CHAIN_SAG : 0;
  return { x: c.x1 + (c.x2 - c.x1) * u, y: c.y1 + (c.y2 - c.y1) * u + Math.sin(u * Math.PI) * sag };
}
// Un squelette d'ossuaire. ⚠ `grav` — le seul monstre du jeu qui tombe — et `revive`, qui le
// fait passer par la branche « tas d'os » de `doodleKillMonster` au lieu de mourir.
function doodleMakeSkel(x, y) {
  return { x, y, w: D_SKEL_W, h: D_SKEL_H, type: 1, alive: true, kind: 'skel', icon: '💀',
           vx: 0, vy: 0, grav: true, revive: true, wt: Math.random() * 6.28 };
}
// 🔒 12.5.8 — BIOME PRISON (demande utilisateur). Trois tuiles, dont deux reprennent des
// mécaniques déjà éprouvées ailleurs — et c'est voulu : un biome n'a pas à tout réinventer, il
// doit avoir sa COULEUR.
// 🪜 L'ÉCHELLE DE PRISON est la ⛓️ Chaîne de l'Enfer, rigide et VERTICALE : les deux dalles
//   naissent l'une au-dessus de l'autre, à la même abscisse, et l'on monte tout droit. Elles
//   partagent `doodleClimbPairs` / `doodleClimbAt` — seule la flèche change (nulle ici).
//   ⚠ La jumelle naît EN DESSOUS, comme partout : posée plus haut elle abaisserait `topY` et la
//   génération croirait la rangée suivante déjà faite, ouvrant un trou infranchissable.
// 🌪️ LA TORNADE DE BARBELÉS : la dalle porte deux FILS barbelés tendus d'un bord à l'autre —
//   le fil, c'est 100 % de la tuile. S'y poser le décolle, et il joue quatre phases enchaînées,
//   toujours le même fil (`doodleBarbWire` dessine les quatre) : 'peel' il s'arrache en 1 s EN
//   PARTANT DE LA DROITE, 'dash' il fonce sur le doodler comme attiré (course en k², pas un
//   glissement), 'orbit' il se referme en ANNEAU qui tourne autour de l'avatar pendant
//   D_BARB_LIFE frames, puis il EXPLOSE en D_BARB_NEEDLES aiguilles lancées en étoile.
//   Tant qu'il tourne, l'anneau déchire toute créature qu'il croise — la morsure se juge sur
//   l'ÉCART au rayon (une couronne), pas sur la distance au centre : le fil est le cercle.
//   ⚠ Il ne blesse JAMAIS le doodler : il tourne autour de LUI, c'est une garde, pas un piège —
//   et une garde qui mord son porteur n'aurait aucun sens.
//   ⚠ Un seul fil à la fois (`s.barb`) : deux anneaux superposés seraient illisibles.
//   ⚠ Il ne revient PLUS se poser : il se dépense. La dalle garde donc ses poteaux nus
//   (`p.barbOut`) pour toujours — on doit voir d'où le fil est parti.
// 🔦 LE PROJECTEUR (tuile rare) : une tourelle au centre de la dalle et deux caméras de part et
//   d'autre. Le faisceau tourne DANS LE SENS DES AIGUILLES D'UNE MONTRE, sans fin.
//   ⚠ La demande s'arrête au milieu de la phrase (« si on fini dans la lumière du projecteur…
//   alors => »). Choix retenu, et il est cohérent avec la fiction du biome : être pris dans le
//   faisceau DÉCLENCHE L'ALARME et fait rappliquer un 👮 gardien, qui fonce droit sur le
//   doodler. Ce n'est pas une mort sèche — c'est une poursuite, donc quelque chose qu'on peut
//   encore jouer. Un dégât immédiat aurait fait de la tuile un piège qu'on subit.
//   ⚠ Un délai de recharge (D_PROJ_COOL) par dalle : sans lui, rester deux secondes dans la
//   lumière appelait une armée.
const D_LADDER_DY = [76, 118];       // écart vertical entre les deux dalles d'une échelle
// 🪜 12.7.4 — L'ÉCHELLE PREND SES AISES (demande utilisateur) : ses deux dalles sont 20 % plus
// longues que les autres, ses montants 20 % plus larges, et surtout AUCUNE dalle n'a le droit
// de les toucher. ⚠ Quand le dégagement n'est pas libre, la paire est ABANDONNÉE en bloc (la
// dalle retombe en verte ordinaire) et non déplacée : la déplacer, c'était rejouer le tirage
// d'abscisse jusqu'à trouver une place, donc parfois jamais — et une rangée sans dalle.
const D_LADDER_W = Math.round(D_PLAT_W * 1.2);   // 74 px : la dalle d'échelle, 20 % plus longue
const D_LADDER_HALF = 7.2;                       // demi-écart des montants (6 px + 20 %)
const D_LADDER_CLEAR = 5;                        // marge de dégagement autour des deux dalles
// Le rectangle `r` est-il libre de toute dalle, marge comprise ? ⚠ Les dalles MORTES ne comptent
// pas : elles ne sont plus dans le monde, seulement en train de s'effacer.
function doodleRectFree(s, r, mrg) {
  const m = mrg == null ? D_LADDER_CLEAR : mrg;
  for (const q of s.platforms) {
    if (q.dead) continue;
    if (r.x - m < q.x + q.w && q.x < r.x + r.w + m && r.y - m < q.y + q.h && q.y < r.y + r.h + m) return false;
  }
  return true;
}
const D_BARB_R = 40;                 // rayon de l'anneau de fil autour du doodler
const D_BARB_LIFE = 300;             // 5 s de garde, puis l'explosion
const D_BARB_SPD = 0.16;             // vitesse angulaire, rad/frame (~2,5 tours en 5 s)
const D_BARB_HIT = 15;               // épaisseur de morsure DE PART ET D'AUTRE du fil
const D_BARB_PEEL = 60;              // 1 s de décollement, en partant de la droite
const D_BARB_DASH = 22;              // la ruée sur le doodler, une fois le fil arraché
const D_BARB_SEG = 48;               // segments de la polyligne du fil (dalle comme anneau)
const D_BARB_GAP = 13;               // écart entre deux barbillons, en px de LONGUEUR DE FIL
const D_BARB_NEEDLES = 16, D_BARB_NEEDLE_V = 6.2;   // l'étoile d'aiguilles de l'explosion
const D_PROJ_R = 165;                // portée du faisceau
const D_PROJ_HALF = 0.24;            // demi-ouverture du cône, en radians (~28° de large)
const D_PROJ_SPD = 0.013;            // vitesse de rotation, rad/frame (~8 s le tour complet)
const D_PROJ_COOL = 260;             // recharge de l'alarme, par dalle
const D_WARDEN_V = 1.35;             // le gardien appelé fonce droit sur le doodler
// L'angle du faisceau à cet instant. ⚠ SENS HORAIRE : en repère écran (y vers le bas), l'angle
// qui CROÎT tourne déjà dans le sens des aiguilles d'une montre — il n'y a donc pas de signe à
// inverser, et c'est exactement le contre-sens qu'on aurait écrit sans y penser.
function doodleProjAng(p, t) { return t * D_PROJ_SPD + (p.ph || 0); }
// Le gardien appelé par l'alarme : il ne patrouille pas, il POURSUIT (`homing`, comme le monstre
// arc-en-ciel). ⚠ Il n'est PAS marqué `rare` : il n'a rien à voir avec le tirage du biome, et
// l'auréole rouge des très rares aurait laissé croire à un butin double.
function doodleMakeWarden(x, y) {
  return { x, y, w: 52, h: 46, type: 1, alive: true, kind: 'warden', icon: '👮',
           homing: D_WARDEN_V, wt: Math.random() * 6.28 };
}
const D_BIOMES = [
  { k:'normal',  name:'Départ',   icon:'📄', paper:'#f4efdd', rule:'#cfe0ef', marge:'#f2c0c0', tiles:[], mobs:[] },
  // 🌲 10.8.0 — LA PRAIRIE DEVIENT LA FORÊT (demande utilisateur) : elle garde sa 🌿 Liane et
  // reprend deux tuiles qui étaient débloquables, le 🌳 Arbre géant et le 🍄 Champignon.
  { k:'foret',   name:'Forêt',    icon:'🌲', paper:'#eef7e2', rule:'#cfe3bd', marge:'#8fbf6a',
    tiles:[
      { k:'vine',     icon:'🌿', name:'Liane',         txt:'une liane pend sous la dalle : attrape-la et tu remontes doucement jusqu\'en haut' },
      { k:'tree',     icon:'🌳', name:'Arbre géant',   own:true, txt:'tu t\'y plantes et tu ne bouges plus : un arbre pousse sous tes pieds et te soulève doucement jusqu\'à la hauteur de la rangée du dessus, où il te relâche — et plus tu y reviens, plus la détente de sortie est forte' },
      { k:'shroom',   icon:'🍄', name:'Champignon',    own:true, w:D_BIOME_TILE_RARE, txt:'un trip de ' + Math.round(D_SHROOM_LIFE / 60) + ' secondes : les couleurs coulent, l\'image ondule — et des créatures qui n\'existent pas se mettent à rôder' },
    ],
    // ⚠ 9.5.1 — Les créatures de biome sont DESSINÉES (demande utilisateur) : l'émoji
    // jurait avec le trait du jeu. `drawn` n'est qu'un repère de lecture — c'est la table
    // `D_MOB_DRAW`, indexée par `k`, qui décide réellement du rendu.
    mobs:[{ k:'bzz',  icon:'🐝', w:38, h:32, vx:1.35, wave:2.2, drawn:true },
          { k:'gluk', icon:'🦉', w:52, h:46, vx:0.55, rare:true, drawn:true }] },
  // 🏜️ 10.8.1 — LE DÉSERT S'ÉTOFFE (demande utilisateur) : le Sable mouvant perd son rebond
  // mou et ne garde que la tempête, la 🌵 Pique quitte D_TILES pour venir ici (redessinée en
  // cactus), et une tuile 𓂀 Égypte fait tomber trois momies.
  { k:'desert',  name:'Désert',   icon:'🏜️', paper:'#f7ecd2', rule:'#e8d3a8', marge:'#e0a45c',
    tiles:[
      { k:'sand',     icon:'🏜️', name:'Sable mouvant', txt:'elle lève une tempête de sable qui voile l\'écran' },
      { k:'spike',    icon:'🌵', name:'Pique',    own:true, txt:'un cactus qui sort ses épines : mortelle au 2e rebond' },
      { k:'egypt',    icon:'𓂀', name:'Égypte',   own:true, w:D_BIOME_TILE_RARE, txt:'la stèle appelle ' + D_MUM_N + ' momies, qui tombent du ciel comme des météorites : celles qui rencontrent une dalle s\'y posent et deviennent des monstres, les autres finissent dans le vide. Une momie abattue lâche ' + D_MUM_LOOT + (D_MUM_LOOT > 1 ? ' coffres' : ' coffre') + '. Une seule fois par dalle' },
    ],
    mobs:[{ k:'scorpion', icon:'🦂', w:36, h:30, vx:1.5, drawn:true },
          { k:'vulture', icon:'🦅', w:52, h:44, vx:1.9, rare:true, drawn:true }] },
  // 🧊 10.8.2 — LE GLACIER SE PARTAGE EN TROIS (demande utilisateur) : la plaque ne fait plus
  // que GLISSER (ni rebond mou, ni gel des bonus), le gel des bonus part sur une tuile de neige
  // à elle, et une stalactite décroche la colonne sous elle.
  { k:'glacier', name:'Glacier',  icon:'🧊', paper:'#e8f4fa', rule:'#c2dfef', marge:'#8fc5e6',
    tiles:[
      { k:'gust',     icon:'❄️', name:'Plaque de glace', txt:'on glisse dessus, et longtemps — le rebond, lui, est ordinaire' },
      { k:'stalac',   icon:'🧊', name:'Stalactite',    own:true, w:D_BIOME_TILE_RARE, txt:'trois piques de glace pendent dessous. T\'y POSER les décroche toutes d\'un coup, et chacune rase la colonne : tout ce qu\'elle rencontre en tombant part dans le vide. LEUR TIRER DESSUS est bien plus mesuré — ' + D_STAL_SHOTS + ' balles pour décrocher une pique (donc ' + (D_STAL_SHOTS * D_STAL_N) + ' pour les trois), et une pique tombée au tir n\'emporte QU\'UNE dalle avant de se briser' },
      { k:'snow',     icon:'🌨️', name:'Congère',      own:true, txt:'un souffle glacé : tous tes bonus et améliorations sont gelés pendant ' + Math.round(D_FROST_LIFE / 60) + ' secondes' },
    ],
    mobs:[{ k:'penguin', icon:'🐧', w:34, h:32, vx:1.1, drawn:true },
          { k:'yeti', icon:'🦣', w:54, h:46, vx:0.8, rare:true, drawn:true }] },
  // 🌋 10.8.3 — LE VOLCAN SÉPARE SES DEUX EFFETS (demande utilisateur) : le Geyser ne fait plus
  // que projeter (et fume), les gouttes de lave passent à une tuile de Magma, et la ☄️
  // Roche volcanique (ex-Météorite) quitte D_TILES pour venir ici.
  { k:'volcan',  name:'Volcan',   icon:'🌋', paper:'#f6e2dc', rule:'#e5b7ab', marge:'#d4674a',
    tiles:[
      { k:'geyser',   icon:'🌋', name:'Geyser',  own:true, txt:'un jet de vapeur qui te projette très haut, sans contrôle' },
      { k:'magma',    icon:'🔥', name:'Magma',   own:true, w:D_BIOME_TILE_RARE, txt:'une coulée en fusion : tant qu\'elle est à l\'écran, elle crache des gouttes de lave qui tuent CE QUI EST SOUS ELLE — se tenir sur la dalle ne risque rien, une goutte ne brûle qu\'une fois retombée sous sa coulée' },
      { k:'meteor',   icon:'☄️', name:'Roche volcanique', own:true, txt:'chaque rebond fait tomber du ciel une roche en fusion, à une abscisse tirée au hasard. Elle explose sur la première dalle rencontrée et tue les monstres pris dans le souffle — mais LA PRENDRE EN PLEINE COURSE te tue aussi (un bouclier la pare)' },
    ],
    mobs:[{ k:'bat', icon:'🦇', w:36, h:28, vx:2.1, wave:3, drawn:true },
          { k:'dragon', icon:'🐉', w:56, h:46, vx:1.2, rare:true, drawn:true }] },
  // 🌌 10.8.4 — LE COSMOS S'ÉTOFFE (demande utilisateur) : l'Attraction gagne 40 % de portée et
  // 40 % de force, et deux tuiles quittent D_TILES pour le rejoindre, le 🕳️ Trou noir et la
  // 🪐 Gravité.
  { k:'cosmos',  name:'Cosmos',   icon:'🌌', paper:'#e6e4f6', rule:'#c9c4ea', marge:'#8f7fd8',
    tiles:[
      { k:'tardis',   icon:'🟦', name:'Sauvé par le TARDIS', own:true, w:D_BIOME_TILE_RARE, txt:'une cabine bleue arrive par un côté, s\'ouvre, te récupère à l\'intérieur et t\'emmène droit vers le haut — puis te dépose sur la PROCHAINE tuile TARDIS. Si tu as quitté le biome avant d\'en croiser une, elle te pose sur la première dalle venue. Rien ne peut te toucher pendant le voyage, et une cabine ne vient qu\'une fois par dalle' },
      { k:'bhole',    icon:'🕳️', name:'Trou noir', own:true, txt:'elle fait naître un trou noir ' + D_BHOLE_ABOVE + ' px au-dessus du haut de l\'écran — tu ne le vois qu\'en montant — et chaque nouveau passage double son volume' },
      { k:'gravity',  icon:'🪐', name:'Gravité',   own:true, txt:'tes sauts montent deux fois moins haut pendant ' + Math.round(D_GRAVITY_LIFE / 60) + ' secondes' },
    ],
    mobs:[{ k:'alien', icon:'👾', w:36, h:32, vx:1.6, wave:2.6, drawn:true },
          { k:'ufo', icon:'🛸', w:54, h:40, vx:2.2, rare:true, drawn:true }] },
  // 🌊 10.7.9 — BIOME OCÉAN (demande utilisateur) : il reprend trois tuiles qui étaient
  // jusqu'ici des tuiles débloquables — 💧 Eau, 🦑 Tentacule et 🫧 Bulle. Elles quittent donc
  // D_TILES pour de bon : une tuile déplacée dans un biome n'est plus tirable au déblocage.
  // ⚠ `own:true` = la dalle GARDE le dessin qu'elle avait dans D_TILES (voir doodlePlatform) :
  // le refaire en plaque de biome générique aurait perdu la cascade, le tentacule et la bulle.
  { k:'ocean',   name:'Océan',    icon:'🌊', paper:'#e2f2f8', rule:'#b8dced', marge:'#3f9fc4',
    tiles:[
      { k:'water',    icon:'💧', name:'Eau',       own:true, txt:'deux cascades tombent de ses bords et ruissellent sur les dalles touchées (' + D_WATER_MAX + ' au plus), qui en relancent deux à leur tour ; s\'y poser fait une flaque, et se prendre un filet t\'emporte doucement vers le bas jusqu\'à la dalle suivante' },
      { k:'tentacle', icon:'🦑', name:'Tentacule', own:true, w:D_BIOME_TILE_RARE, txt:'un tentacule jaillit de la dalle et te projette dans une direction imprévisible, mais deux fois moins haut qu\'un saut de sa force — et il ne protège plus de rien' },
      { k:'bubble',   icon:'🫧', name:'Bulle',     own:true, txt:'tu te retrouves enfermé dans une bulle qui te fait monter à l\'abri de tout, puis elle éclate et te rend un saut ordinaire — tirer la crève aussitôt' },
    ],
    mobs:[{ k:'jelly', icon:'🪼', w:38, h:38, vx:0.65, wave:2.4, drawn:true },
          { k:'shark', icon:'🦈', w:58, h:40, vx:2.0, rare:true, drawn:true }] },
  // 🌃 10.8.5 — BIOME NIGHT CITY (demande utilisateur) : une ville cyberpunk de nuit, néons et
  // pluie. Il reprend trois tuiles qui étaient débloquables — 📡 Arc électrique, 🐛 Buguée et
  // ⚡ Électrifiée — qui quittent donc D_TILES.
  { k:'city',    name:'Night City', icon:'🌃', paper:'#e4e2f0', rule:'#c2c0dc', marge:'#ff3fa8',
    tiles:[
      { k:'arc',      icon:'📡', name:'Arc électrique', own:true, txt:'seule elle ne fait rien : dès qu\'une deuxième antenne est à l\'écran et à portée, un arc se tend entre elles et crépite par intermittence — SEULE la travée tendue entre les deux mâts fait mal, jamais le pied d\'une antenne : se poser sur la dalle ne risque rien, même arc allumé' },
      { k:'glitch',   icon:'🐛', name:'Buguée',   own:true, txt:'une dalle qui déraille : elle dérive EN DIAGONALE, les deux axes à la fois, en rebondissant sur les bords de l\'écran et sans jamais s\'éloigner de sa rangée. Par instants elle DISPARAÎT de l\'écran et revient aussitôt — elle est toujours là et porte toujours, c\'est l\'image qui décroche. Le rebond, lui, est tout ce qu\'il y a de plus ordinaire' },
      { k:'zap',      icon:'⚡', name:'Électrifiée', own:true, w:D_BIOME_TILE_RARE, txt:'une décharge toutes les deux secondes : mortelle si active' },
    ],
    mobs:[{ k:'drone', icon:'🛰️', w:40, h:32, vx:1.7, wave:1.8, drawn:true },
          { k:'mecha', icon:'🤖', w:56, h:48, vx:0.9, rare:true, drawn:true }] },
  // ☁️ 10.10.8 — BIOME NUAGES (demande utilisateur) : le plein ciel et ses anges. Il reprend la
  // 👻 Fantôme, qui quitte D_TILES (une tuile déplacée dans un biome n'est plus tirable au
  // déblocage), et apporte la 🌬️ Girouette et l'⛈️ Orage.
  // ⚠ 11.6.1 — L'☁️ NUAGE EST SUPPRIMÉ (demande utilisateur) : sa dalle et celle du 👻 Fantôme
  // se ressemblaient à s'y méprendre — deux blancheurs qui s'effacent après le rebond — et le
  // Fantôme est celle qui a un visage. C'est donc lui qui tient désormais le biome du ciel ;
  // ses ~2 s de sursis remplacent la seconde du Nuage, et rien d'autre ne change.
  // ⚠ 10.11.0 — L'🌈 Arc-en-ciel N'EN FAIT PLUS PARTIE (demande utilisateur) : c'est une tuile
  // bonus, elle est repassée dans D_TILES et se débloque au palier, dans tous les biomes.
  { k:'nuages',  name:'Nuages',   icon:'☁️', paper:'#eef6fd', rule:'#cfe4f5', marge:'#7fb8e8',
    tiles:[
      { k:'ghost',  icon:'👻', name:'Fantôme', own:true, txt:'s\'efface deux secondes après qu\'on a marché dessus' },
      { k:'gale',   icon:'🌬️', name:'Direction du vent', own:true, txt:'une girouette tournée vers l\'un des quatre points cardinaux. Elle ne souffle QUE si tu marches dessus, et alors pendant ' + Math.round(D_GALE_LIFE / 60) + ' s : toutes les ' + Math.round(D_GALE_EVERY / 60) + ' s elle pousse TOUTES les plateformes de ' + D_GALE_PUSH + ' px dans son sens — elles restent où le vent les a menées — et il te fait dériver en continu, tes sauts montant ' + Math.round(D_GALE_JUMP * 100) + ' % plus haut quand il monte, autant de moins quand il descend. Des filets d\'air balaient l\'écran tant qu\'il souffle, une seule bourrasque à la fois, et tout retombe au changement de biome' },
      { k:'storm',  icon:'⛈️', name:'Orage',   own:true, w:D_BIOME_TILE_RARE, txt:'toutes les ' + Math.round(D_STORM_EVERY / 60) + ' s, la foudre frappe ce qu\'il y a de plus proche PLUS BAS qu\'elle : une dalle, qui décroche et tombe dans le vide, ou toi. L\'immunité électrique t\'en protège' },
    ],
    mobs:[{ k:'cherub', icon:'👼', w:38, h:34, vx:1.15, wave:2.2, drawn:true },
          { k:'seraph', icon:'😇', w:56, h:46, vx:0.85, rare:true, drawn:true }] },
  // 🔥 12.5.7 — BIOME ENFER (demande utilisateur) : le seul biome entièrement NOIR ET ROUGE,
  // et le seul dont les trois tuiles sont neuves — rien n'y est repris du catalogue.
  { k:'enfer',   name:'Enfer',    icon:'😈', paper:'#f0dad6', rule:'#d2a49c', marge:'#8f1d14',
    tiles:[
      { k:'chain',    icon:'⛓️', name:'Chaîne',   own:true, txt:'elles naissent PAR DEUX, à des hauteurs différentes, et une chaîne pend entre les deux. Te poser sur la dalle du BAS, c\'est la gravir jusqu\'à celle du haut, où tu repars d\'un saut' },
      { k:'ossuary',  icon:'🦴', name:'Ossuaire', own:true, txt:'une seconde après son entrée à l\'écran elle crache un squelette, puis un autre toutes les ' + Math.round(D_SKEL_EVERY / 60) + ' s. Le squelette TOMBE — c\'est la seule créature du jeu soumise à la gravité — se pose où il peut et marche vers toi. L\'abattre ne rapporte AUCUN coffre : il s\'effondre en tas d\'os, attend ' + Math.round(D_SKEL_DOWN / 60) + ' s et se reconstruit en ' + Math.round(D_SKEL_REBUILD / 60) + ' s' },
      { k:'eflame',   icon:'🔥', name:'Flamme éternelle', own:true, w:D_BIOME_TILE_RARE, txt:'une coulée de magma à ciel ouvert : une créature qui la touche brûle, une balle tirée dedans est ABSORBÉE — et t\'y poser arme tes ' + D_FLAME_SHOTS + ' tirs suivants en LANCE-FLAMMES. Un jet qui rencontre une dalle en embrase le sommet pendant ' + Math.round(D_BURN_LIFE / 60) + ' s, et ce sommet détruit tout ce qu\'il touche — les créatures, et toi aussi. Te tenir sur la coulée, en revanche, ne risque rien' },
    ],
    mobs:[{ k:'skel',  icon:'💀', w:36, h:40, vx:1.15, drawn:true },
          { k:'demon', icon:'👹', w:54, h:46, vx:1.05, rare:true, drawn:true }] },
  // 🔒 12.5.8 — BIOME PRISON (demande utilisateur) : la cour, ses murs, ses miradors et ses
  // projecteurs. Deux de ses trois tuiles reprennent une mécanique éprouvée ailleurs, et c'est
  // voulu — un biome n'a pas à tout réinventer, il doit avoir sa couleur.
  { k:'prison',  name:'Prison',   icon:'🔒', paper:'#e4e6e9', rule:'#bfc4cc', marge:'#5c6470',
    tiles:[
      { k:'ladder',  icon:'🪜', name:'Échelle de prison', own:true, txt:'elles naissent PAR DEUX, l\'une au-dessus de l\'autre et à la même abscisse, avec une échelle entre les deux. Te poser sur celle du BAS, c\'est en monter les barreaux jusqu\'à celle du haut, où tu repars d\'un saut' },
      { k:'barbed',  icon:'🌪️', name:'Tornade de barbelés', own:true, txt:'le fil s\'ARRACHE de la dalle par la droite, fonce sur toi comme aimanté et se referme en anneau tournant pendant ' + Math.round(D_BARB_LIFE / 60) + ' s, déchirant toute créature qu\'il croise — puis il explose en ' + D_BARB_NEEDLES + ' aiguilles. Il ne te blesse jamais : c\'est une garde. Un seul fil en l\'air à la fois' },
      { k:'searchlight', icon:'🔦', name:'Projecteur', own:true, w:D_BIOME_TILE_RARE, txt:'une tourelle au centre de la dalle et deux caméras de surveillance. Le faisceau tourne dans le sens des aiguilles d\'une montre, sans fin : t\'y faire prendre DÉCLENCHE L\'ALARME et fait rappliquer un 👮 gardien, qui fonce droit sur toi. Une alarme toutes les ' + Math.round(D_PROJ_COOL / 60) + ' s par dalle' },
    ],
    mobs:[{ k:'inmate', icon:'🧍', w:36, h:42, vx:1.3, drawn:true },
          { k:'warden', icon:'👮', w:52, h:46, vx:1.0, rare:true, drawn:true }] },
];
// 🏗️ 9.8.3 — LE BÂTISSEUR (demande utilisateur) : TRÈS TRÈS TRÈS rare, et c'est le seul
// monstre qu'on ne tue pas. Une balle ne l'abat pas — elle le décide à POSER une plateforme
// au prochain palier au-dessus du doodler, puis il s'en va. Il reste mortel au contact comme
// n'importe quelle créature : c'est un monstre qu'on peut retourner à son avantage, pas un allié.
// ⚠ Taux volontairement sous le rôdeur (3,5 %) d'un ordre de grandeur : « très très très rare ».
const D_BUILDER_FROM = 300, D_BUILDER_P = 0.004;
// Palier visé = la rangée EXISTANTE la plus basse au-dessus du doodler. Poser la dalle à une
// hauteur inventée l'aurait mise entre deux rangées, là où elle n'aide personne.
// ⚠ Repli sur un saut confortable (D_GAP_SAFE) quand il n'y a rien au-dessus : le cas se
// produit en haut d'un jetpack, précisément quand la dalle est la plus utile.
function doodleBuildPlat(s, W) {
  let ny = null;
  for (const q of s.platforms) if (q.y < s.py - 30 && (ny == null || q.y > ny)) ny = q.y;
  if (ny == null) ny = s.py - D_GAP_SAFE;
  // Abscisse libre : on écarte les dalles déjà présentes sur la rangée, sinon la nouvelle
  // se superposerait à l'une d'elles et le cadeau serait invisible.
  const busy = s.platforms.filter(q => Math.abs(q.y - ny) < 6);
  let x = 6 + Math.random() * (W - D_PLAT_W - 12);
  for (let tryn = 0; tryn < 12 && busy.some(q => Math.abs(q.x - x) < D_PLAT_W + 8); tryn++) x = 6 + Math.random() * (W - D_PLAT_W - 12);
  const p = { x, y: ny, w: D_PLAT_W, h: D_PLAT_H, type: 'green', dead: false, built: true };
  s.platforms.push(p);
  for (let k = 0; k < 16; k++) { const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; s.parts.push({ x: x + D_PLAT_W / 2, y: ny, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 26, max: 26, sz: 3, c: k % 2 ? '#ffd54a' : '#7ec850' }); }
  return p;
}
// Impact d'un projectile (balle ou ✴️ shuriken) sur une créature. Renvoie true quand elle a
// été traitée AUTREMENT que par la mort — aujourd'hui le seul cas est le 🏗️ bâtisseur, que
// l'on met au travail. ⚠ Centralisé : deux projectiles frappent, et sans ce point unique l'un
// des deux aurait fini par tuer le bâtisseur au lieu de le faire bâtir.
// 🛡️ 10.6.9 — LE RÉFLECTEUR RENVOIE LE TIR (demande utilisateur). Le projectile ne meurt pas
// sur son bouclier : il REPART, retourné, et devient dangereux pour qui l'a lancé. Il rejoint
// `s.tshots`, le tableau des projectiles HOSTILES — celui qui porte déjà le défilement de la
// caméra, la cascade de boucliers et le nettoyage hors écran.
// ⚠ Le renvoi part LÉGÈREMENT DE CÔTÉ (dispersion tirée au sort) : rendu pile sur sa
// trajectoire, il revenait droit dans le canon et tirer devenait un suicide mécanique plutôt
// qu'un risque à évaluer.
// ⚠ Il repart MOINS VITE que la balle (D_SHLD_BACK) : à pleine vitesse, un tir renvoyé
// arrivait avant qu'on ait fini le geste qui l'a envoyé.
const D_SHLD_BACK = 0.62, D_SHLD_FLASH = 16, D_SHLD_SPREAD = 0.5;
// 🍿 Un grain de pop-corn en vol. Cinq bosses irrégulières autour d'un cœur doré, une ombre
// chaude décalée qui donne le volume, un halo de beurre et un sillage de trois fantômes.
// ⚠ La silhouette est tirée de `g.seed`, une graine PORTÉE PAR LE GRAIN, et jamais du temps :
// recalculée à chaque frame elle aurait grésillé au lieu de tourner, et les quatre grains d'une
// même gerbe se seraient déformés à l'unisson.
// ⚠ L'ombre est une COPIE des bosses décalée, pas un contour : un trait ferait apparaître les
// coutures entre les bosses, qui ne sont qu'un empilement de disques.
// ⚠ Le sillage est tracé HORS de la rotation : entraîné par elle, il aurait tourné autour du
// grain au lieu de rester derrière lui.
function doodlePopDraw(ctx, g) {
  const r = D_POP_SHOT_R, sd = g.seed || 0.5;
  const sp = Math.hypot(g.vx, g.vy) || 1, ux = g.vx / sp, uy = g.vy / sp;
  for (let i = 3; i >= 1; i--) {                                    // le sillage, du plus pâle au plus dense
    ctx.globalAlpha = 0.10 * (4 - i);
    ctx.fillStyle = i > 1 ? '#ffd98a' : '#fff1c9';
    ctx.beginPath(); ctx.arc(g.x - ux * i * 5, g.y - uy * i * 5, r * (0.78 - i * 0.14), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(g.x, g.y);
  const hg = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r * 2.6);   // le halo de beurre chaud
  hg.addColorStop(0, 'rgba(255,214,120,0.36)'); hg.addColorStop(0.55, 'rgba(255,190,80,0.14)'); hg.addColorStop(1, 'rgba(255,190,80,0)');
  ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, r * 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(g.spin || 0);
  const lob = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + ((sd * (i + 3) * 7.3) % 1) * 0.55;
    const d = r * (0.46 + ((sd * (i + 7) * 5.1) % 1) * 0.30);
    lob.push([Math.cos(a) * d, Math.sin(a) * d, r * (0.54 + ((sd * (i + 11) * 3.7) % 1) * 0.26)]);
  }
  const bosses = (dx, dy, fill) => { ctx.fillStyle = fill; lob.forEach(([lx, ly, lr]) => { ctx.beginPath(); ctx.arc(lx + dx, ly + dy, lr, 0, Math.PI * 2); ctx.fill(); }); };
  bosses(1.1, 1.5, '#c8913f');        // l'ombre grillée, décalée en bas à droite
  bosses(0, 0, '#fff6dc');            // la chair soufflée
  bosses(-0.9, -1.1, '#fffdf4');      // et le jour qui frappe en haut à gauche
  // Le reste de la coque, caramélisé. ⚠ DÉCENTRÉ et petit : un gros disque doré pile au milieu
  // se lisait comme un jaune d'œuf, pas comme un grain éclaté.
  ctx.fillStyle = '#d99a2e';
  ctx.beginPath(); ctx.arc(r * 0.14, r * 0.2, r * 0.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(200,145,63,0.75)';   // deux éclats de coque, pour la texture
  ctx.beginPath(); ctx.arc(-r * 0.5, r * 0.34, r * 0.11, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.46, -r * 0.18, r * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.arc(-r * 0.42, -r * 0.5, r * 0.19, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.62, r * 0.11, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function doodleShieldBounce(s, m, b) {
  m.sh = D_SHLD_FLASH;
  const v = Math.hypot(b.vx, b.vy) * D_SHLD_BACK || 1;
  const a = Math.atan2(-b.vy, -b.vx) + (Math.random() - 0.5) * D_SHLD_SPREAD;
  s.tshots = s.tshots || [];
  s.tshots.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 5, back: true });
  for (let k = 0; k < 8; k++) { const a2 = Math.random() * Math.PI * 2, vv = 1 + Math.random() * 2.5; s.parts.push({ x: b.x, y: b.y, vx: Math.cos(a2) * vv, vy: Math.sin(a2) * vv, life: 16, max: 16, sz: 2.5, c: k % 2 ? '#bfe4f5' : '#ffffff' }); }
}
function doodleStrike(s, m, W) {
  // 🐉 Dragonneau : il encaisse. ⚠ Testé AVANT le bâtisseur pour rester lisible, mais les deux
  // sont exclusifs. ⚠ `return true` = traité autrement que par la mort, donc la balle s'arrête
  // là : une balle perforante qui traverserait un dragonneau encore debout aurait volé au
  // joueur la seule chose que ses points de vie promettent, un tir par point.
  if (m.hp > 1) {
    m.hp--; m.hurt = D_HATCH_TEL / 4;
    for (let k = 0; k < 8; k++) { const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2.5; s.parts.push({ x: m.x + m.w / 2, y: m.y + m.h / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 18, max: 18, sz: 3, c: k % 2 ? '#ffd54a' : '#e2564a' }); }
    return true;
  }
  if (m.builder) {
    m.alive = false;
    doodleBuildPlat(s, W);
    s.toast = { txt: '🏗️ Le bâtisseur te pose une plateforme !', life: D_TOAST_LIFE };
    return true;
  }
  // ⚠ `true` : un 🛡️ Réflecteur ne parvient JAMAIS jusqu'ici par une balle ordinaire ni par un
  // shuriken — les deux ricochent plus haut. Seul le 🚀 missile y arrive, et c'est justement lui
  // qui doit passer outre le pavois.
  doodleKillMonster(s, m, true);
  return false;
}
// ════════ 💀 9.9.7 — LA CASE CAUCHEMARDESQUE (demande utilisateur) ════════
// Une dalle, UNE SEULE FOIS par partie et au taux de la 🍀 case chance, qui fait surgir un
// monstre horrible. Le combat suspend le jeu de plateforme : les dalles disparaissent, un
// plancher apparaît sous le doodler (il ne peut plus tomber), il NE SAUTE PLUS et ne fait que
// se déplacer à gauche et à droite. Cinq points de vie, trois monstres possibles, trois
// attaques chacun. Terrassé, il lâche trois trésors et une tuile neuve ; une fois les trésors
// ramassés, les dalles reviennent et la montée reprend.
// ⚠ Le TIR EST GRATUIT pendant le combat : à sec de munitions, la partie se serait bloquée
// pour de bon dans une arène sans issue. C'est la seule garantie que le combat soit gagnable.
// ⚠ Pas avant D_BOSS_FROM points : le combat suspend tout le jeu de plateforme, le déclencher
// dans les vingt premières secondes aurait remplacé l'apprentissage du jeu par une arène.
const D_BOSS_FROM = 400;
// ⚠ 10.0.7 — LES BOSS SONT PLUS COÛTEUX À ABATTRE (demande utilisateur) : +5 PV avant
// D_BOSS_HP_HI_FROM points, +10 au-delà. ⚠ Le maximum est FIGÉ dans `s.boss.hpMax` à
// l'ouverture du combat : la barre de vie et le compteur le relisent là, jamais dans la
// constante — sinon franchir 1000 points en plein combat ferait sauter la barre.
const D_BOSS_HP = 5;
const D_BOSS_HP_HI_FROM = 1000, D_BOSS_HP_ADD_LO = 5, D_BOSS_HP_ADD_HI = 10;
function doodleBossHp(score) { return D_BOSS_HP + (score >= D_BOSS_HP_HI_FROM ? D_BOSS_HP_ADD_HI : D_BOSS_HP_ADD_LO); }
const D_BOSS_LOOT = 3;
// ⚠ 10.0.7 — CADENCE D'ATTAQUE RALENTIE DE 20 % (demande utilisateur) : 88 → 110 frames entre
// deux attaques, soit 88/0,8. C'est le pendant des points de vie en plus : un combat plus long
// mais pas plus dense, sinon la vie ajoutée n'aurait fait qu'allonger le pilonnage.
const D_BOSS_ATK_GAP = 110;    // frames entre deux attaques
const D_BOSS_TEL = 42;         // frames d'annonce AVANT que l'attaque ne parte
const D_BOSS_W = 108, D_BOSS_H = 74, D_BOSS_Y = 92;
// ⚠ 10.0.4 — HAUTEUR DU PLANCHER DE L'ARÈNE (demande utilisateur) : il se posait là où se
// trouvait le doodler, borné à H*0,55 — soit le MILIEU de l'écran dès qu'on entrait dans le
// combat en étant haut. Le boss reste, lui, à D_BOSS_Y (92 px du haut) : la moitié de l'écran
// en moins, c'est deux fois moins de temps pour esquiver ses tirs, et le combat devenait très
// difficile. Le plancher est désormais FIXE, à 5 % du bas du plateau : l'arène fait toute la
// hauteur, quel que soit l'endroit d'où l'on est entré.
const D_BOSS_FLOOR_R = 0.95;
const D_BOSS_SHOT_V = 3.1, D_BOSS_SHOT_R = 7;
const D_BOSS_SPIKE_UP = 34, D_BOSS_SPIKE_LIFE = 78, D_BOSS_SPIKE_W = 26;
// ⚠ 10.5.7 — LES PIQUES DU SOL S'ANNONCENT 2 s À L'AVANCE (demande utilisateur) : la zone
// EXACTE clignote au plancher, de plus en plus vite, avant que quoi que ce soit ne sorte.
// ⚠ C'est une annonce PROPRE à chaque pique, en plus de D_BOSS_TEL (l'annonce générale de
// l'attaque, qui ne dit pas OÙ) : les fentes sont tirées au sort sur la largeur, et sans
// repère au sol, la seule parade était de deviner. Pendant l'annonce la pique ne blesse
// pas et ne sort pas — son compte à rebours de vie ne commence qu'après.
const D_BOSS_SPIKE_WARN = 120;
const D_BOSS_BEAM_V = 1.35, D_BOSS_BEAM_W = 22;
// 🛡️ 10.6.2 — LE SORT BOUCLIER (demande utilisateur) : à peine un sort lancé, le boss se pose
// un bouclier qui TANQUE D_BOSS_SH balles. Tant qu'il tient, aucun point de vie ne tombe.
// ⚠ Posé APRÈS le tir et jamais pendant l'annonce : le combat garde une fenêtre où le boss est
// nu, sinon il n'aurait plus jamais été touchable une seule frame.
// ⚠ Il ne se recharge pas tout seul — seul le sort SUIVANT le remet. Deux balles bien placées
// et le boss redevient vulnérable jusqu'au prochain sort : c'est un péage, pas une immunité.
// ⚠ La balle est consommée qu'elle brise le bouclier ou non, perforante comprise : une balle
// qui l'aurait traversé en aurait fait une décoration.
const D_BOSS_SH = 2, D_BOSS_SH_FLASH = 12;
// ⚠ Les trois monstres partagent le MÊME vocabulaire d'attaques (`rain`, `spikes`, `beam`,
// `volley`) : ce sont leur ORDRE, leur cadence et leur réglage qui les distinguent. Trois jeux
// d'attaques entièrement séparés auraient triplé la surface de bugs pour le même résultat à
// l'écran. ⚠ Toutes se parent EN SE DÉPLAÇANT LATÉRALEMENT, jamais en sautant : le doodler
// n'en a plus le droit pendant le combat.
const D_BOSS_KINDS = [
  { k:'ver',    name:'Le Ver Blême',      atk:['rain', 'spikes', 'volley'], n:[7, 3, 5],  body:'#cfd6b8', dark:'#7c8a5c', eye:'#3a2a10' },
  { k:'gueule', name:'La Gueule',         atk:['volley', 'beam', 'rain'],   n:[3, 1, 4],  body:'#b0424a', dark:'#5f1b21', eye:'#ffd54a' },
  { k:'oeil',   name:"L'Œil Sans Fond",   atk:['beam', 'spikes', 'volley'], n:[2, 5, 7],  body:'#6a4bb0', dark:'#33205c', eye:'#eafcff' },
];
function doodleBossKind(s) { return D_BOSS_KINDS.find(b => b.k === (s.boss && s.boss.kind)) || D_BOSS_KINDS[0]; }
// Ouverture du combat. ⚠ Tous les états « en cours » du doodler sont coupés net (vol, liane,
// accordéon, glissade, tapis) : entrer dans l'arène en plein jetpack l'aurait fait traverser
// le plancher, et une liane accrochée à une dalle devenue invisible n'aurait mené nulle part.
function doodleBossStart(s, W, H) {
  const kind = D_BOSS_KINDS[Math.floor(Math.random() * D_BOSS_KINDS.length)];
  s.bossDone = true;
  s.bossHide = true;
  s.bossFloorY = Math.round(H * D_BOSS_FLOOR_R);
  const hp = doodleBossHp(s.score);
  s.boss = { kind: kind.k, hp, hpMax: hp, x: W / 2, vx: 1.15, timer: D_BOSS_ATK_GAP, seq: 0, cur: null, tel: 0, hurt: 0, sh: 0, shHit: 0 };
  s.bossShots = []; s.bossSpikes = []; s.bossBeam = null; s.bossLoot = 0;
  // ⚠ 11.2.2 — LE MONDE HOSTILE EST EFFACÉ, PAS SEULEMENT MASQUÉ. Le dessin cachait déjà
  // créatures, météorites et compagnie derrière `bossHide`, et trois commentaires du moteur
  // affirmaient que « les monstres sont suspendus pendant le combat » — c'était FAUX : rien
  // ne vidait ces tableaux. Une case 💀 déclenchée avec des créatures à l'écran laissait donc
  // une couche invisible bien vivante DANS l'arène : les missiles la prenaient pour cible au
  // lieu du boss, les balles s'y arrêtaient avant de l'atteindre, et chaque créature abattue
  // hors champ lâchait son coffre. Les momies en chute sont vidées AUSSI : en se posant elles
  // repeupleraient `s.monsters`. ⚠ NE PAS toucher aux dalles, bonus, trous ni coffres : le
  // monde de plateforme reprend tel quel à la fin du combat (`bossHide` repasse à false).
  s.monsters = []; s.mums = []; s.meteors = []; s.tshots = []; s.spirits = []; s.drops = []; s.slays = []; s.stals = []; s.pops = [];
  s.fly = 0; s.flyType = null; s.acc = null; s.vine = null; s.tride = null; s.grab = null; s.tardis = null; s.chainUp = null; s.barb = null; s.slip = 0; s.beltLeft = 0; s.tmag = 0;
  s.py = s.bossFloorY - D_FEET; s.vy = 0;
  s.lastPlat = null; s.bounceStreak = 0;
  s.banner = { txt: `💀 ${kind.name}`, sub: `plus de saut — déplace-toi et tire · ${hp} points de vie · 🛡️ ${D_BOSS_SH} balles après chaque sort`, life: D_BANNER_LIFE * 1.6 };
}
// Déclenche l'attaque `k` du boss. Chaque forme est un simple semis d'objets : c'est la boucle
// qui les fait vivre, ce qui garde le déclenchement lisible.
function doodleBossFire(s, W, H, k, n) {
  const b = s.boss;
  if (k === 'rain') {
    for (let i = 0; i < n; i++) s.bossShots.push({ x: 16 + Math.random() * (W - 32), y: b.y0 + 30, vx: 0, vy: D_BOSS_SHOT_V });
  } else if (k === 'volley') {
    // Visée FIGÉE sur la position du doodler au départ : des projectiles qui se recorrigeraient
    // ne seraient pas esquivables, et l'arène deviendrait une mort à retardement.
    const dx = s.px - b.x, dy = (s.bossFloorY - D_FEET) - b.y0;
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dy, dx) + (i - (n - 1) / 2) * 0.17;
      s.bossShots.push({ x: b.x, y: b.y0 + 26, vx: Math.cos(a) * D_BOSS_SHOT_V * 1.25, vy: Math.sin(a) * D_BOSS_SHOT_V * 1.25 });
    }
  } else if (k === 'spikes') {
    // Fentes RÉPARTIES sur la largeur et tirées sans doublon : il doit toujours rester un
    // passage libre, sinon l'attaque ne s'esquive pas et ne se pare qu'avec un bouclier.
    const slots = Math.max(n + 2, 6), used = [];
    for (let i = 0; i < n; i++) {
      let sl; do { sl = Math.floor(Math.random() * slots); } while (used.indexOf(sl) >= 0);
      used.push(sl);
      s.bossSpikes.push({ x: (sl + 0.5) * (W / slots), warn: D_BOSS_SPIKE_WARN, life: D_BOSS_SPIKE_LIFE, max: D_BOSS_SPIKE_LIFE });
    }
  } else if (k === 'beam') {
    // Le rayon balaie depuis le bord OPPOSÉ au doodler : on a toujours le temps de le voir venir.
    const fromLeft = s.px > W / 2;
    s.bossBeam = { x: fromLeft ? -D_BOSS_BEAM_W : W + D_BOSS_BEAM_W, vx: (fromLeft ? 1 : -1) * D_BOSS_BEAM_V * (n > 1 ? 1.5 : 1) };
  }
}
// Un pas de combat. Renvoie false si le doodler y laisse la vie — l'appelant déclenche la mort.
function doodleBossStep(s, W, H, sf) {
  const b = s.boss, kind = doodleBossKind(s);
  b.y0 = D_BOSS_Y;
  b.x += b.vx * sf;
  if (b.x < D_BOSS_W / 2 + 6) { b.x = D_BOSS_W / 2 + 6; b.vx *= -1; }
  else if (b.x > W - D_BOSS_W / 2 - 6) { b.x = W - D_BOSS_W / 2 - 6; b.vx *= -1; }
  if (b.hurt > 0) b.hurt -= sf;
  if (b.shHit > 0) b.shHit -= sf;
  // — enchaînement des attaques : annonce, puis tir —
  if (b.tel > 0) {
    b.tel -= sf;
    if (b.tel <= 0) {
      const i = b.seq % kind.atk.length;
      doodleBossFire(s, W, H, kind.atk[i], kind.n[i]);
      b.seq++;
      b.sh = D_BOSS_SH; b.shHit = D_BOSS_SH_FLASH;   // 🛡️ le sort bouclier : il se referme sur lui dès que le précédent est parti
      b.timer = D_BOSS_ATK_GAP;
    }
  } else {
    b.timer -= sf;
    if (b.timer <= 0) { b.tel = D_BOSS_TEL; b.cur = kind.atk[b.seq % kind.atk.length]; }
  }
  // — projectiles —
  const hit = (x, y, r) => Math.abs(x - s.px) < r + 10 && Math.abs(y - s.py) < r + 15;
  for (const sh of s.bossShots) { sh.x += sh.vx * sf; sh.y += sh.vy * sf; }
  for (const sh of s.bossShots) {
    if (sh.spent || !hit(sh.x, sh.y, D_BOSS_SHOT_R)) continue;
    sh.spent = true;
    if (!doodleHurt(s)) return false;
  }
  s.bossShots = s.bossShots.filter(sh => !sh.spent && sh.y < H + 20 && sh.x > -20 && sh.x < W + 20);
  // — piques du plancher : elles sortent, restent, puis rentrent —
  for (const sp of s.bossSpikes) {
    // ⚠ Pendant l'annonce, RIEN : la pique ne sort pas, ne blesse pas, et son temps de vie
    // n'a pas commencé — décompter la vie ici aurait raccourci la pique d'autant.
    if (sp.warn > 0) { sp.warn -= sf; sp.up = 0; continue; }
    sp.life -= sf;
    const up = Math.sin(Math.min(1, (1 - sp.life / sp.max) * 1.25) * Math.PI);
    sp.up = up;
    if (up > 0.35 && Math.abs(s.px - sp.x) < D_BOSS_SPIKE_W / 2 + 8 && !sp.spent) {
      sp.spent = true;
      if (!doodleHurt(s)) return false;
    }
  }
  s.bossSpikes = s.bossSpikes.filter(sp => sp.life > 0);
  // — rayon balayant —
  if (s.bossBeam) {
    s.bossBeam.x += s.bossBeam.vx * sf;
    if (Math.abs(s.bossBeam.x - s.px) < D_BOSS_BEAM_W / 2 + 8) {
      if (!s.bossBeam.spent) { s.bossBeam.spent = true; if (!doodleHurt(s)) return false; }
    } else s.bossBeam.spent = false;
    if (s.bossBeam.x < -D_BOSS_BEAM_W * 2 || s.bossBeam.x > W + D_BOSS_BEAM_W * 2) s.bossBeam = null;
  }
  return true;
}
// Mise à mort du boss : trois trésors sur le plancher et une tuile neuve. ⚠ La tuile est
// mise EN ATTENTE (`s.unlockPending`) et non annoncée ici : geler la partie en pleine arène,
// entre les coffres à ramasser, casserait le rythme du combat. L'écran de déblocage habituel
// (celui des paliers de 500 points) s'ouvre à la SORTIE de l'arène, juste avant de retrouver
// les dalles — c'est le moment où l'on a besoin de savoir quelle tuile va apparaître.
function doodleBossKill(s, W) {
  const kind = doodleBossKind(s);
  s.bossKills = (s.bossKills || 0) + 1;   // 🏅 compté ici, seul point de passage d'une mise à mort de boss (quête ultime)
  for (let k = 0; k < 40; k++) { const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5; s.parts.push({ x: s.boss.x, y: D_BOSS_Y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 34, max: 34, sz: 4, c: k % 2 ? kind.body : kind.dark }); }
  s.boss = null; s.bossShots = []; s.bossSpikes = []; s.bossBeam = null;
  s.bossLoot = D_BOSS_LOOT;
  for (let i = 0; i < D_BOSS_LOOT; i++) {
    s.chests.push({ x: (i + 0.5) * (W / D_BOSS_LOOT) - D_CHEST_W / 2, y: s.bossFloorY - D_CHEST_H, w: D_CHEST_W, h: D_CHEST_H, vy: 0, landed: true, taken: false, plat: null, boss: true });
  }
  const t = doodleTileUnlock(s);
  if (t) s.unlockPending = t;
  s.banner = { txt: `💀 ${kind.name} terrassé !`, sub: t ? `${D_BOSS_LOOT} trésors · une tuile t'attend à la sortie` : `${D_BOSS_LOOT} trésors`, life: D_BANNER_LIFE * 1.6 };
}
// Plancher de l'arène : de VRAIES dalles dessinées côte à côte — « seulement des tuiles sous
// doodle », et elles disent d'elles-mêmes qu'on ne peut pas tomber.
function doodleBossFloor(ctx, s, W) {
  const y = s.bossFloorY;
  for (let x = -6; x < W + 6; x += D_PLAT_W + 2) doodlePlatform(ctx, { x, y, w: D_PLAT_W, h: D_PLAT_H, type: 'green' }, s.tw);
}
// ⚠ 9.3.7 — RÔDEUR (demande utilisateur) : la seule créature qui se déplace sur LES DEUX AXES.
// Elle n'apparaît qu'à partir de 1000 points et reste très rare. Son va-et-vient vertical est
// borné à D_ROAM_SPAN autour de sa ligne d'apparition : libre, elle finirait par sortir de
// l'écran ou par camper sur une plateforme, et on ne pourrait plus jamais passer.
const D_ROAM_FROM = 1000, D_ROAM_P = 0.035, D_ROAM_SPAN = 58, D_ROAM_VY = 0.9, D_ROAM_VX = 1.25;
// 🏔️ 10.6.9 — TROIS CRÉATURES DE HAUTE ALTITUDE (demande utilisateur), à partir de
// D_HIGH_FROM points et rares chacune. Elles ne s'AJOUTENT pas aux monstres : comme les
// créatures de biome et le rôdeur, elles REMPLACENT le monstre de la rangée — la densité de
// dangers ne bouge donc pas d'un cran à 10 000 points, seule leur nature change.
// ⚠ Elles se partagent le MÊME tirage `r` en bandes disjointes : trois `Math.random()`
// séparés se seraient additionnés et auraient noyé les créatures de biome.
//   🪨 Caillasseur — perché sur SA dalle, il lance des pierres en cloche, lentement.
//   🦔 Hérissé    — couvert de piques : lui sauter dessus ou le percuter ne le tue pas, ça tue.
//   🛡️ Réflecteur — son bouclier RENVOIE les tirs ; seuls le missile et l'écrasement en viennent.
const D_HIGH_FROM = 10000, D_HIGH_P = 0.045;
// 🪨 Lancer en CLOCHE : durée de vol visée fixe, d'où la vitesse initiale se déduit — viser
// tout droit aurait donné un caillou plat impossible à distinguer d'un tir de dalle.
// ⚠ `D_ROCK_VX_MAX` borne la composante horizontale : sans elle, une cible à l'autre bout de
// l'écran faisait partir la pierre plus vite qu'une balle, ce que « relativement doucement »
// exclut. Le caillou tombe alors court, et c'est très bien : il annonce sa portée.
const D_ROCK_GAP = 165, D_ROCK_T = 120, D_ROCK_G = 0.035, D_ROCK_VX_MAX = 2.2, D_ROCK_R = 6.5;
function doodleMakeRock(pl) {
  const w = 42, h = 34;
  return { x: Math.max(6, Math.min(DOODLE_W - w - 6, pl.x + pl.w / 2 - w / 2)), y: pl.y - h,
           w, h, type: 1, alive: true, kind: 'rock', rare: true, perch: pl, throw: D_ROCK_GAP, vx: 0 };
}
function doodleMakeSpiky(ny) {
  const y = ny - 42;
  return { x: 10 + Math.random() * (DOODLE_W - 66), y, y0: y, w: 46, h: 40, type: 1, alive: true,
           kind: 'spiky', rare: true, spiky: true, wave: 1, wt: Math.random() * 6.28,
           vx: (Math.random() < 0.5 ? -1 : 1) * 0.85 };
}
function doodleMakeShield(ny) {
  return { x: 10 + Math.random() * (DOODLE_W - 68), y: ny - 42, w: 48, h: 42, type: 1, alive: true,
           kind: 'shield', rare: true, shield: true, sh: 0, vx: (Math.random() < 0.5 ? -1 : 1) * 0.7 };
}
// ⚠ 9.5.3, 10.9.4 puis 10.9.5 — LE TAUX DES TUILES DE BIOME (demandes utilisateur) : 5 %, puis
// 6 %, puis 24 % pour la bande entière, et enfin 20 % PAR TUILE.
// ⚠ C'est le passage d'un taux de BANDE à un taux PAR TUILE qui compte ici. Avant, une
// constante unique était partagée entre les tuiles du biome : ajouter une tuile à un biome
// rendait toutes les autres plus rares. Désormais chaque tuile a SON taux et la bande se
// déduit du nombre de tuiles — un biome de trois tuiles en tire 60 %, un biome d'une seule
// n'en tire que 20 %, et l'identité de chaque tuile ne dépend plus de ses voisines.
// ⚠ La bande est PLAFONNÉE (D_BIOME_TILE_MAX) : sans borne, un biome de six tuiles aurait
// dépassé 1 et pris TOUTES les rangées ordinaires.
// ⚠ Deux garde-fous inchangés la retiennent : elle ne prend qu'une rangée ORDINAIRE (verte ou
// bleue) et jamais deux spéciales de suite. Le second est le vrai frein — il impose une rangée
// ordinaire entre deux tuiles de biome, si bien que la part RÉELLEMENT vue à l'écran est
// nettement sous le taux tiré.
// ⚠ 10.9.5 — LE TAUX TIRÉ N'EST PAS LE TAUX VU, ET L'ÉCART EST GRAND. Mesuré sur 8 000 rangées
// générées depuis un état de partie réel (voir le tableau ci-dessous), le tirage est étranglé
// en aval par deux choses : la tuile de biome ne prend qu'une rangée restée ORDINAIRE (les
// bandes cassante/blanche/multicolore/coffre/tuile débloquée servent avant elle), et jamais
// deux spéciales de suite. Ce second garde-fou est SELF-LIMITANT : plus on tire de tuiles de
// biome, plus la rangée suivante leur est interdite.
//   tiré par tuile :   8 %    20 %    34 %    50 %   100 %   · 100 % sans le garde-fou
//   vu par tuile   : 3,6 %   7,6 %  11,3 %  11,1 %  10,6 %   ·          15,8 %
// La courbe SATURE vers 34 % : au-delà, tirer plus fait voir MOINS. C'est donc là qu'est réglé
// le taux — au point le plus haut de ce qu'on peut réellement voir à l'écran.
// ⚠ Viser 20 % VUS par tuile (60 % des rangées) est hors d'atteinte : le garde-fou plafonne à
// lui seul toutes les spéciales à une rangée sur deux, et les tuiles de biome les partagent
// avec les tuiles débloquées et les coffres. Le lever donnerait 15,8 % — mais il n'existe que
// pour garantir qu'une plateforme ordinaire reste toujours à portée.
const D_BIOME_TILE_EACH = 0.34;      // part des rangées TIRÉE par tuile du biome (~11 % vues)
const D_BIOME_TILE_SEEN = 1 / 3;     // ce qu'il en reste après les garde-fous, mesuré
const D_BIOME_TILE_MAX = 0.95;       // … et le plafond de la bande, tuiles cumulées
function doodleBiomeTileP(n) { return Math.min(D_BIOME_TILE_MAX, D_BIOME_TILE_EACH * n); }
const D_MOB_RARE = 0.06;          // part des monstres qui sont la créature TRÈS rare du biome
const D_MOB_UNCOMMON = 0.28;      // … et celle qui sont la peu rare
// Toutes les tuiles de biome, tous biomes confondus. ⚠ Une seule source : la table D_BIOMES.
// Y ajouter une tuile suffit à la faire connaître du tirage, du dessin et de l'encyclopédie.
const D_BIOME_TILE_LIST = D_BIOMES.reduce((a, b) => a.concat(b.tiles.map(t => Object.assign({ biome: b }, t))), []);
const D_BIOME_TILES = new Set(D_BIOME_TILE_LIST.map(t => t.k));
function doodleBiomeTileDef(k) { return D_BIOME_TILE_LIST.find(t => t.k === k) || null; }
// ⚠ `own:true` = la dalle garde le dessin qu'elle avait dans D_TILES, et passe donc par
// `doodleTileDraw` et non par la plaque de biome générique. Sans ce tri, une tuile déplacée
// d'une liste à l'autre perdrait son image du jour au lendemain.
const D_BIOME_OWNDRAW = new Set(D_BIOME_TILE_LIST.filter(t => t.own).map(t => t.k));
// La définition d'une tuile, qu'elle vienne du catalogue débloquable ou d'un biome. ⚠ TOUT ce
// qui affiche une tuile par sa clé (rouleaux de la 🎰, écran de bannissement, bulle du 🃏 Casino)
// passe par ici : `s.tiles` peut porter une tuile de BIOME (le 🃏 Casino y pioche déjà), et un
// `D_TILES.find` nu rendait alors `undefined` — donc une case vide ou un plantage.
function doodleTileAny(k) { return D_TILES.find(t => t.k === k) || doodleBiomeTileDef(k); }
// ⚠ 12.5.3 — LA 🎰 MACHINE À SOUS NE COPIE PLUS CE QU'ON A DÉJÀ (demande utilisateur). Ses
// trois rouleaux promettent trois tuiles « aussitôt ajoutées à la partie » ; ils pouvaient
// tomber sur une tuile déjà débloquée — voire trois fois sur la même — et c'était un rouleau
// pour rien. Le vivier exclut donc les tuiles présentes et les tuiles bannies, et le tirage se
// fait SANS REMISE : les trois sont distincts.
// ⚠ 12.5.4 — ELLE SAIT AUSSI COPIER UNE TUILE DE BIOME (demande utilisateur), mais nettement
// moins souvent : D_COPY_W_BIOME pour les deux tuiles ordinaires d'un biome, D_COPY_W_RARE pour
// sa rare, contre 1 pour une tuile du catalogue débloquable. Copier la tuile rare d'un biome,
// c'est l'emporter avec soi dans TOUS les biomes suivants — elle doit se mériter.
// ⚠ Le poids porte sur le TIRAGE, à l'inverse de D_BIOME_TILE_RARE dans la génération de
// rangées, qui filtre APRÈS coup : là-bas la rangée retombe en plateforme ordinaire, ici il
// n'y a rien où retomber — un rouleau doit sortir quelque chose.
// ⚠ Le vivier peut se vider (fin de partie très avancée) : on rend alors moins de `n` tuiles, et
// l'affichage s'y règle — compléter avec des doublons aurait re-promis ce qu'on possède déjà.
function doodleCopyW(k) {
  if (!D_BIOME_TILES.has(k)) return 1;
  const d = doodleBiomeTileDef(k);
  return d && d.w ? D_COPY_W_RARE : D_COPY_W_BIOME;
}
function doodleCopyRoll(s, n) {
  const pool = [...D_TILES.map(t => t.k), ...D_BIOME_TILE_LIST.map(t => t.k)]
    .filter(k => k !== 'slot' && s.tiles.indexOf(k) < 0 && (s.banned || []).indexOf(k) < 0);
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    let tot = 0; for (const k of pool) tot += doodleCopyW(k);
    let r = Math.random() * tot, j = 0;
    for (; j < pool.length - 1; j++) { r -= doodleCopyW(pool[j]); if (r < 0) break; }
    out.push(pool[j]); pool.splice(j, 1);
  }
  return out;
}
// ⚠ Il n'y a qu'UNE dalle mortelle dans tout le jeu, la 🌵 Pique — passée du catalogue des
// tuiles débloquables au biome Désert en 10.8.1. L'ensemble est CONSERVÉ malgré son unique
// membre : tout le code de la pique (armement, mise à mort, plateforme de secours, dessin)
// passe par lui, et le remplacer par un test d'égalité éparpillerait la règle en cinq
// endroits pour rien.
const D_SPIKY = new Set(['spike']);
// 🌿 Liane : elle pend sur un quart de la hauteur de l'écran sous sa dalle. On l'attrape au
// contact et on remonte à D_VINE_V px/frame — soit ~2,5 s de montée, « relativement doucement ».
// ⚠ La largeur de prise est étroite (D_VINE_GRAB) : une corde qui happerait sur toute la
// largeur de la dalle aurait rendu impossible de simplement passer à côté.
const D_VINE_LEN = Math.round(DOODLE_H * 0.25), D_VINE_V = 1.35, D_VINE_GRAB = 13;
// 🏜️ 9.9.0 — TEMPÊTE DE SABLE (demande utilisateur) : se poser sur le sable mouvant lève un
// vent de sable qui voile l'écran pendant D_SAND_LIFE frames. ⚠ Le voile est tenu à
// D_SAND_VEIL : le brouillard du malus 🌫️ monte à 0,82 et masque tout — ici il ne s'agit pas
// de punir mais de gêner, la montée doit rester lisible et jouable de bout en bout.
const D_SAND_LIFE = 300, D_SAND_VEIL = 0.34, D_SAND_GRAINS = 90;
const D_GEYSER = 1.62, D_GEYSER_SLIP = 26;   // 🌋 projection + frames sans contrôle
// 🌋 10.8.3 — LE PANACHE DE VAPEUR (demande utilisateur) : le geyser ne crache plus la lave,
// il FUME. `p.steam` décompte les frames du jet ; en dehors, la dalle ne laisse échapper que
// quelques volutes lentes, pour qu'on la reconnaisse même froide.
const D_STEAM_LIFE = 46;
// 🔥 9.9.4 — GOUTTES DE LAVE (demande utilisateur) : chaque coulée de magma à l'écran en
// crache une à intervalle régulier ; les prendre tue, exactement comme un monstre — donc à travers la même
// cascade de boucliers (`doodleHurt`), jamais par une mort sèche que rien ne pourrait parer.
// ⚠ La cadence est PAR DALLE et de phase tirée au sort : sans cela, toutes les coulées de
// l'écran cracheraient à l'unisson et il n'y aurait qu'un seul instant sûr pour tout le monde.
// ⚠ La goutte naît AU-DESSUS de la dalle et retombe : elle ne peut donc pas frapper le doodler
// à l'instant même du rebond, au moment où il n'a encore rien pu esquiver.
// ⚠ 10.0.9 — CHUTE RALENTIE DE 50 % ET GOUTTE PLUS GROSSE (demande utilisateur) : la gravité
// ET la vitesse terminale sont HALVÉES ensemble (0,2 → 0,1 · 5,4 → 2,7), sinon la goutte
// atteindrait le même palier de vitesse, simplement plus tard. Le rayon passe de 5 à 8 px, et
// la boîte de contact est DÉRIVÉE de ce rayon : la recopier en dur, c'était garantir qu'une
// goutte deux fois plus grosse continue de se toucher sur son ancienne taille.
// ⚠ 10.6.5 — FRÉQUENCE RÉDUITE DE 20 % (demande utilisateur) : c'est l'INTERVALLE qui monte
// (96 → 120 frames, soit 2 s à 60 fps), une fréquence ne se règle pas autrement. Ni la
// gravité ni la vitesse terminale ne bougent : la goutte tombe pareil, elles sont juste
// moins nombreuses.
// ⚠ 12.5.0 — ON NE MEURT PLUS EN MARCHANT SUR LA DALLE (correctif). La goutte naissait à
// `q.y - 10`, c'est-à-dire À 5 PX DU CORPS de qui se tenait dessus (`s.py = q.y - D_FEET`),
// et la boîte de contact fait D_LAVA_HIT_Y de demi-hauteur : le simple fait de se poser sur la
// dalle au mauvais moment tuait, sans le moindre geste possible — la goutte n'était pas encore
// tombée qu'elle brûlait déjà.
// ⚠ La règle est désormais : UNE GOUTTE NE BRÛLE QUE CE QUI EST SOUS ELLE. Elle reste inerte
// tant qu'elle n'est pas descendue de D_LAVA_ARM sous le sommet de la dalle qui l'a crachée
// (`dr.y0`) — c'est-à-dire pendant tout son jet vers le haut et sa redescente à travers la
// dalle. Passé ce seuil, elle tombe pour de bon et tue comme avant.
// ⚠ D_LAVA_ARM est DÉRIVÉ de l'épaisseur de la dalle et non écrit en dur : il doit rester
// supérieur à D_LAVA_HIT_Y − D_FEET (5 px) pour que la boîte de contact ne rattrape jamais un
// doodler posé sur la dalle. À 26, la marge est de 41 px contre 20 — on ne la franchit pas par
// accident, et le seuil se lit comme ce qu'il est : « la goutte a quitté sa dalle ».
// ⚠ `dr.y0` est un point DU MONDE : il suit le défilement de la caméra avec `dr.y`, comme
// l'origine de l'éclair de l'⛈️ Orage. Figé, le seuil aurait dérivé d'un écran à l'autre.
const D_LAVA_EVERY = 120, D_LAVA_G = 0.1, D_LAVA_VMAX = 2.7, D_LAVA_R = 8;
const D_LAVA_HIT_X = D_LAVA_R + 7, D_LAVA_HIT_Y = D_LAVA_R + 12;
const D_LAVA_ARM = D_PLAT_H + 12;
// 🎊 10.1.3 — CONFETTIS (demande utilisateur, en remplacement de la 🌠 Étoile filante) : le
// rebond arme la dalle pour D_CONF_LIFE frames (5 s à 60 fps) pendant lesquelles elle CRACHE des
// confettis, qui retombent ensuite d'elles-mêmes. ⚠ C'est un ÉMETTEUR posé sur la dalle
// (`p.conf`), pas une gerbe unique : « ils sortent de la tuile PUIS tombent, pendant 5 secondes »
// décrit une source qui dure, pas un jet instantané qu'on regarderait s'éteindre.
// ⚠ Ce sont de purs objets de décor, JAMAIS des plateformes : les ranger dans `s.platforms` les
// aurait rendues praticables et aurait faussé toute la montée.
// ⚠ Ils suivent la caméra comme le reste du monde, sinon ils resteraient collés à l'écran.
// ⚠ Le total est BORNÉ (D_CONF_MAX) : 5 secondes d'émission libre sur plusieurs dalles à la
// fois auraient fait des centaines d'objets à dessiner par frame sur un mobile.
const D_CONF_LIFE = 300, D_CONF_EVERY = 4, D_CONF_BURST = 3, D_CONF_MAX = 260;
const D_CONF_G = 0.055, D_CONF_VMAX = 1.9, D_CONF_SWAY = 0.9;
const D_CONF_COLS = ['#ffd54a', '#ff8fc8', '#8fe8ff', '#a8ff8f', '#ffffff', '#c9a8ff', '#ff8c3a', '#8fb8ff', '#ffe9a8', '#ff6f6f'];
function doodleTier(score) { return Math.max(0, Math.floor(score / D_BIOME_STEP)); }
// ⚠ 9.4.5 — Le biome d'une tranche est TIRÉ AU SORT une fois puis MÉMORISÉ dans la partie :
// le recalculer à la volée le ferait clignoter d'une frame à l'autre. La tranche 0 est toujours
// le décor normal, et deux tranches voisines ne tombent jamais sur le même biome.
function doodleBiomeAt(s, tier) {
  if (tier <= 0 || doodleClassic(s)) return 0;   // 🎮 Classique : le décor ne change jamais
  if (!s.biomes) s.biomes = [0];
  for (let k = 1; k <= tier; k++) {
    if (s.biomes[k] != null) continue;
    const prev = s.biomes[k - 1];
    let pick;
    do { pick = 1 + Math.floor(Math.random() * (D_BIOMES.length - 1)); } while (pick === prev);
    s.biomes[k] = pick;
  }
  return s.biomes[tier];
}
function doodleBiome(s) { return D_BIOMES[s.biome || 0]; }
// Un monstre pour la rangée `ny` : la créature TRÈS rare du biome, sa peu rare, ou l'un des
// trois monstres d'origine. ⚠ Le tirage remplace le monstre standard, il ne s'y AJOUTE pas :
// la densité de dangers reste exactement celle d'avant les biomes.
function doodleMakeMob(s, ny, pl) {
  const b = doodleBiome(s), r = Math.random();
  if (doodleClassic(s)) { const mt = Math.floor(Math.random() * 3); return { x: 10 + Math.random() * (DOODLE_W - 60), y: ny - 40, w: 44, h: 38, type: mt, alive: true, vx: mt === 1 ? (Math.random() < 0.5 ? -1 : 1) * 0.72 : 0 }; }
  // 🏗️ Bâtisseur : testé EN PREMIER, il est le plus rare de tous et sa part ne doit être
  // grignotée par aucun autre tirage.
  if (s.score >= D_BUILDER_FROM && r < D_BUILDER_P) {
    return { x: 10 + Math.random() * (DOODLE_W - 66), y: ny - 42, w: 46, h: 40, type: 1, alive: true,
             kind: 'builder', rare: true, builder: true, vx: (Math.random() < 0.5 ? -1 : 1) * 0.6 };
  }
  // 👁 Rôdeur : testé AVANT les créatures de biome, il est plus rare qu'elles et doit garder
  // sa part propre plutôt que d'être noyé dans leur tirage.
  if (s.score >= D_ROAM_FROM && r < D_ROAM_P) {
    const y = ny - 44;
    return { x: 10 + Math.random() * (DOODLE_W - 66), y, y0: y, w: 46, h: 42, type: 1, alive: true,
             kind: 'roamer', rare: true, vx: (Math.random() < 0.5 ? -1 : 1) * D_ROAM_VX,
             vy2: (Math.random() < 0.5 ? -1 : 1) * D_ROAM_VY, span: D_ROAM_SPAN };
  }
  // 🏔️ Haute altitude : trois bandes disjointes, à la suite de celle du rôdeur.
  // ⚠ Le 🪨 Caillasseur exige la dalle de sa rangée : appelée sans elle (la dalle 👹 Générateur,
  // l'œuf), la fabrique n'a rien où le percher et la bande revient aux deux autres.
  if (s.score >= D_HIGH_FROM) {
    if (r < D_ROAM_P + D_HIGH_P && pl) return doodleMakeRock(pl);
    if (r < D_ROAM_P + D_HIGH_P * 2) return doodleMakeSpiky(ny);
    if (r < D_ROAM_P + D_HIGH_P * 3) return doodleMakeShield(ny);
  }
  const spec = !b.mobs.length ? null : r < D_MOB_RARE ? b.mobs[1] : r < D_MOB_RARE + D_MOB_UNCOMMON ? b.mobs[0] : null;
  if (spec) {
    return { x: 10 + Math.random() * (DOODLE_W - spec.w - 20), y: ny - 40 - (spec.rare ? 8 : 0),
             w: spec.w, h: spec.h, type: 1, alive: true, kind: spec.k, icon: spec.icon, rare: !!spec.rare,
             vx: (Math.random() < 0.5 ? -1 : 1) * spec.vx, wave: spec.wave || 0, wt: Math.random() * 6.28, y0: ny - 40 - (spec.rare ? 8 : 0) };
  }
  const mt = Math.floor(Math.random() * 3);
  return { x: 10 + Math.random() * (DOODLE_W - 60), y: ny - 40, w: 44, h: 38, type: mt, alive: true, vx: mt === 1 ? (Math.random() < 0.5 ? -1 : 1) * 0.72 : 0 };
}
// « max 1 de suite » : jamais une tuile spéciale juste après une autre (ni après une cassante).
const D_SPECIAL = new Set(D_TILES.map(t => t.k).concat(['rainbow', 'perk', 'lucky', 'unlucky', 'chest', 'rrfake', 'nightmare'], [...D_BIOME_TILES]));
// 🎲 Les leurres de la roulette russe : dessinés comme une dalle, mais RIEN ne s'y pose —
// ni le doodler, ni un coffre qui tombe, ni une météorite. Un seul prédicat pour les trois,
// sinon un coffre finirait par flotter en l'air sur une plateforme qui n'existe pas.
// ⚠ 🪷 `p.ori === 2` : l'origami déplié en passoire se TRAVERSE — pour le doodler comme pour
// les coffres et les météorites, sinon un coffre serait resté posé sur du vide.
function doodleSolid(p) { return !p.dead && p.type !== 'rrfake' && p.ori !== 2 && p.tama !== false; }
// Ces cases-là n'emmènent jamais de monstre ni de trou sur leur propre ligne.
const D_NOMOB = new Set(['rainbow', 'perk', 'lucky', 'unlucky']);
const D_ICE_SLIP = 22;          // frames sans contrôle après un rebond sur la glace
// ⚠ 10.8.2 — La ❄️ Plaque de glace glisse PLUS LONGTEMPS (demande utilisateur, « augmente
// légèrement la glisse ») : +36 %. C'est le seul effet qui lui reste, et sa constante est
// SÉPARÉE de D_ICE_SLIP, encore lu ailleurs (🚦 Feu tricolore au jaune).
const D_ICE_SLIP_HARD = 30;
const D_BOMB_FUSE = 58;         // ~1 s de mèche
// ⚠ 9.3.1 — ☄️ ROCHE VOLCANIQUE (ex-« Météorite ») : chaque rebond en appelle une, qui tombe du
// ciel à une abscisse tirée au hasard. Elle EXPLOSE au contact d'une plateforme ou du bas de
// l'écran et tue les monstres pris dans le souffle.
// ⚠ 11.3.0 — ELLE EST ENFIN DANGEREUSE POUR LE DOODLER (demande utilisateur). Le commentaire
// le promettait depuis 9.3.1, le code ne l'a jamais fait : la roche lui passait au travers. La
// prendre sur la tête coûte désormais un encaissement — via `doodleHurt`, donc un bouclier la
// pare comme tout le reste, et sans protection c'est la mort. C'est ce qui en fait une tuile à
// double tranchant plutôt qu'un bonus gratuit.
// ⚠ Le SOUFFLE, lui, ne touche toujours que les monstres : c'est la roche qu'on esquive, pas
// son cratère — sinon la tuile se retournerait contre le joueur à chaque rebond, sans parade.
// ⚠ 11.3.0 — VITESSE RÉDUITE DE 20 % (4,6 → 3,68) : à 4,6 px/frame elle arrivait plus vite
// qu'on ne la voyait, et « esquivable » ne voulait rien dire.
const D_METEOR_V = 4.6 * 0.8, D_METEOR_R = 15, D_METEOR_BOOM = 62;
// 💧 Réseau des filets d'eau à l'écran. Renvoie `{ falls, wet }` : les segments verticaux à
// dessiner (et dont on peut se faire prendre) et les dalles mouillées (film d'eau + gouttes).
// ⚠ UNE SEULE source pour le dessin ET pour la capture du doodler : deux parcours séparés, et
// c'était la garantie qu'un filet visible finisse par ne pas être celui qui emporte.
// ⚠ Parcours en LARGEUR : une cascade nourrit ses deux voisines avant que celles-ci ne
// nourrissent les leurs. En profondeur, le budget de D_WATER_MAX serait parti tout entier dans
// une seule branche et l'autre bord de la dalle n'aurait jamais coulé.
function doodleWaterFlows(s, H) {
  const falls = [], wet = [];
  const src = s.platforms.filter(q => doodleEffType(q) === 'water' && !q.dead && q.y > -60 && q.y < H + 20);
  for (const p0 of src) {
    let budget = D_WATER_MAX;
    const queue = [p0];
    while (queue.length && budget > 0) {
      const p = queue.shift();
      for (const side of [-1, 1]) {
        const x = side < 0 ? p.x + 3 : p.x + p.w - 3;
        let hit = null;
        for (const q of s.platforms) {
          if (q === p || !doodleSolid(q) || q.y <= p.y + 6) continue;
          if (x < q.x || x > q.x + q.w) continue;
          if (!hit || q.y < hit.y) hit = q;
        }
        falls.push({ x, y0: p.y + p.h, y1: hit ? hit.y : H + 24, hit: !!hit });   // `hit` : le filet s'écrase sur une dalle (éclaboussure) ou sort par le bas (rien à éclabousser)
        if (!hit || budget <= 0) continue;
        if (wet.indexOf(hit) >= 0) continue;   // déjà mouillée par l'autre bord : elle ne consomme pas deux fois le budget
        wet.push(hit); budget--; queue.push(hit);
      }
    }
  }
  return { falls, wet };
}
// ⚙️⚡ Fenêtre active d'une tuile à cycle. La phase est propre à chaque dalle (voir doodleSpawnRow).
function doodleCycleOn(p, t) {
  // ⚠ Type EFFECTIF : appelée avec la vraie dalle depuis la collision (un casino y porte encore
  // `type:'casino'`) et avec la dalle imitée depuis le dessin. Lire `p.type` donnait au casino
  // le cycle des picots alors qu'il affichait celui de l'électrifiée — la fenêtre mortelle et
  // l'éclair dessiné ne coïncidaient plus.
  const et = doodleEffType(p);
  const cyc = et === 'zap' ? D_ZAP_CYCLE : D_PICOT_CYCLE, on = et === 'zap' ? D_ZAP_ON : D_PICOT_ON;
  return ((t + (p.ph || 0)) % cyc) < on;
}
// 🔀 Randomiseur : permutation des POSITIONS des dalles visibles, et rien d'autre. Ce qui est
// PORTÉ par une dalle doit suivre son déplacement : l'axe du va-et-vient de l'ascenseur (`y0`) et
// les coffres posés dessus — sinon le premier sortirait de sa ligne et les seconds resteraient
// suspendus dans le vide. Renvoie le nombre de dalles déplacées (0 s'il n'y a rien à mélanger).
function doodleShuffleTiles(s, H) {
  const vis = s.platforms.filter(p => !p.dead && p.y > -20 && p.y < H + 20);
  if (vis.length < 2) return 0;
  const pos = vis.map(p => ({ x: p.x, y: p.y }));
  for (let i = pos.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const tmp = pos[i]; pos[i] = pos[j]; pos[j] = tmp; }   // Fisher-Yates
  vis.forEach((p, i) => {
    const nx = Math.max(4, Math.min(DOODLE_W - p.w - 4, pos[i].x)), dx = nx - p.x, dy = pos[i].y - p.y;
    p.x = nx; p.y = pos[i].y;
    if (p.y0 != null) p.y0 += dy;                                          // 🛗 l'ascenseur emporte l'axe de sa course
    for (const c of s.chests) if (c.plat === p) { c.x += dx; c.y += dy; }   // 📦 le coffre posé voyage avec sa dalle
    for (let k = 0; k < 3; k++) s.parts.push({ x: p.x + Math.random() * p.w, y: p.y + p.h / 2, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 20, max: 20, sz: 2.5, c: k % 2 ? '#ffe9a8' : '#8e5bd8' });
  });
  return vis.length;
}
function doodleTileUnlock(s) {
  if (doodleClassic(s)) return null;   // 🎮 Classique : aucune tuile ne se débloque
  // ⚠ 🕊️ Les tuiles bannies par la miséricordieuse sont exclues du tirage : sans ce filtre, le
  // palier suivant aurait rendu à la partie ce que le joueur venait d'en retirer.
  const left = D_TILES.filter(t => s.tiles.indexOf(t.k) < 0 && (s.banned || []).indexOf(t.k) < 0);
  if (!left.length) return null;                       // les 5 sont déjà là → seuls les bonus continuent
  const t = left[Math.floor(Math.random() * left.length)];
  s.tiles.push(t.k);
  if (t.k === 'slot') s.nextSlot = s.score + D_SLOT_STEP;   // 🎰 une dalle garantie tous les 500 points à partir d'ici
  return t;
}
// ☄️ Roche volcanique en chute : boule ardente + traînée, pour qu'on la voie arriver de loin.
function doodleMeteorDraw(ctx, m) {
  ctx.save();
  const g = ctx.createLinearGradient(m.x, m.y - 34, m.x, m.y + D_METEOR_R);
  g.addColorStop(0, 'rgba(255,140,58,0)'); g.addColorStop(1, 'rgba(255,140,58,0.75)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(m.x - 5, m.y); ctx.lineTo(m.x, m.y - 34); ctx.lineTo(m.x + 5, m.y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5b3a1c'; ctx.beginPath(); ctx.arc(m.x, m.y, D_METEOR_R * 0.72, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff8c3a'; ctx.beginPath(); ctx.arc(m.x - 2, m.y - 2, D_METEOR_R * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(m.x - 3, m.y - 3, D_METEOR_R * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// Voile d'extinction des tuiles à usage unique : elles restent des plateformes sur lesquelles
// on rebondit, elles ne promettent simplement plus rien. ⚠ Un seul voile pour toutes, sinon
// chaque tuile inventerait sa nuance de gris et « épuisée » cesserait de se lire d'un coup d'œil.
function doodleTileSpent(ctx, p) {
  ctx.save(); ctx.globalAlpha = 0.55; doodleRR(ctx, p.x, p.y, p.w, p.h, 6, '#2b2b33'); ctx.restore();
}
// ☁️ Le galbe d'un nuage aux dimensions d'une dalle : trois bourrelets qui DÉBORDENT vers le
// haut et un ventre plat, là où l'on se pose. ⚠ Un seul tracé pour les deux tuiles de météo du
// ciel (🌬️ Girouette, ⛈️ Orage) : dessinées chacune dans son coin, elles auraient fini par ne
// plus se ressembler alors que c'est leur FAMILLE qui doit se lire en premier.
// ⚠ Bourrelets et ventre sont peints du MÊME `fill` en deux temps, sans contour : un tracé
// unique aurait demandé de raccorder trois arcs à la main pour un galbe qu'on lit déjà.
function doodleCloudBody(ctx, x, y, w, h, fill, edge) {
  ctx.fillStyle = fill;
  [[0.2, 7.5], [0.47, 10], [0.76, 8]].forEach(([f, r]) => { ctx.beginPath(); ctx.arc(x + w * f, y + h * 0.44, r, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillRect(x + 5, y + 2, w - 10, h - 3);
  if (edge) { ctx.fillStyle = edge; ctx.fillRect(x + 5, y + h - 3.5, w - 10, 3.5); }   // la sous-face, qui dit où l'on pose le pied
}
// 🌬️ 12.5.9 — LE CORPS DE LA GIROUETTE S'ARRONDIT SUR LES CÔTÉS (demande utilisateur). Elle
// partageait le nuage de l'⛈️ Orage ; elle a désormais son propre corps en GÉLULE — demi-cercles
// complets à gauche et à droite — surmonté des deux bosses qui gardent la silhouette de nuage.
// ⚠ Les bosses sont conservées, et c'est ce qui fait la « légère » modification demandée : sans
// elles, la dalle serait devenue une pastille bleue qu'on ne relie plus au biome des Nuages.
// ⚠ La sous-face reste plate : c'est elle qui dit où l'on pose le pied, l'arrondir aurait rendu
// le bord d'appui illisible.
function doodleGaleBody(ctx, x, y, w, h, fill, edge) {
  const r = h / 2;
  ctx.fillStyle = fill;
  [[0.30, 6.5], [0.66, 7.5]].forEach(([f, rr]) => { ctx.beginPath(); ctx.arc(x + w * f, y + h * 0.30, rr, 0, Math.PI * 2); ctx.fill(); });
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath(); ctx.fill();
  if (edge) { ctx.fillStyle = edge; ctx.fillRect(x + r, y + h - 3.5, w - h, 3.5); }
}
// 🟦 La cabine du TARDIS, en style Doodle : aplats vifs, gros contour sombre. Origine =
// MILIEU DU BAS (elle se pose sur le sommet d'une dalle). ⚠ Une seule primitive pour les quatre
// usages — la dalle, l'arrivée, le voyage, le dépôt : redessiner la cabine à chaque endroit,
// c'était garantir qu'elles finissent par ne plus se ressembler.
// ⚠ `open` (0→1) écarte les DEUX battants et découvre l'intérieur noir : des portes qui
// s'effaceraient au lieu de coulisser n'auraient rien dit de « elle s'ouvre pour te récupérer ».
function doodleTardisBox(ctx, cx, by, sc, open, t, alpha) {
  const w = D_TARDIS_W * sc, h = D_TARDIS_H * sc, x = cx - w / 2, y = by - h;
  ctx.save();
  if (alpha != null) ctx.globalAlpha *= alpha;
  const BLEU = '#1f4f8f', SOMBRE = '#12315a', BORD = '#0b1c33';
  // la lanterne, qui bat comme un phare — c'est elle qui dit que la cabine est en marche
  const lum = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.16));
  ctx.fillStyle = 'rgba(255,244,190,' + (0.30 * lum).toFixed(3) + ')';
  ctx.beginPath(); ctx.arc(cx, y - h * 0.10, w * 0.38, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff4be'; ctx.strokeStyle = BORD; ctx.lineWidth = 1.6 * sc;
  ctx.beginPath(); ctx.arc(cx, y - h * 0.10, w * 0.11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // le toit : une corniche plus large que le corps, comme sur la vraie cabine
  ctx.fillStyle = SOMBRE; ctx.strokeStyle = BORD; ctx.lineWidth = 2 * sc;
  ctx.beginPath(); ctx.rect(x - w * 0.09, y - h * 0.055, w * 1.18, h * 0.075); ctx.fill(); ctx.stroke();
  // le corps
  ctx.fillStyle = BLEU;
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
  // le bandeau « POLICE BOX » : quatre traits clairs, illisibles à cette taille mais reconnaissables
  ctx.fillStyle = '#f2f5f8'; ctx.fillRect(x + w * 0.06, y + h * 0.055, w * 0.88, h * 0.075);
  ctx.fillStyle = BORD;
  for (let i = 0; i < 5; i++) ctx.fillRect(x + w * (0.14 + i * 0.16), y + h * 0.078, w * 0.075, h * 0.028);
  // l'intérieur, découvert par l'ouverture des portes
  const ow = (w / 2 - w * 0.06) * Math.max(0, Math.min(1, open || 0));
  if (ow > 0.3) {
    ctx.fillStyle = '#07101d';
    ctx.fillRect(cx - ow, y + h * 0.16, ow * 2, h * 0.82);
    // la lueur de la salle de contrôle : sans elle, l'ouverture n'est qu'un trou noir
    ctx.fillStyle = 'rgba(122,206,255,0.30)';
    ctx.fillRect(cx - ow, y + h * 0.16, ow * 2, h * 0.82);
  }
  // les deux battants, écartés d'autant
  for (const sgn of [-1, 1]) {
    const dw = w / 2 - w * 0.06;
    const dx = cx + sgn * ow + (sgn < 0 ? -dw : 0);
    ctx.fillStyle = BLEU; ctx.strokeStyle = BORD; ctx.lineWidth = 1.6 * sc;
    ctx.beginPath(); ctx.rect(dx, y + h * 0.16, dw, h * 0.82); ctx.fill(); ctx.stroke();
    // fenêtre haute à quatre carreaux
    ctx.fillStyle = '#cfe6f5';
    ctx.fillRect(dx + dw * 0.16, y + h * 0.20, dw * 0.68, h * 0.16);
    ctx.strokeStyle = SOMBRE; ctx.lineWidth = 1 * sc;
    ctx.beginPath();
    ctx.moveTo(dx + dw * 0.5, y + h * 0.20); ctx.lineTo(dx + dw * 0.5, y + h * 0.36);
    ctx.moveTo(dx + dw * 0.16, y + h * 0.28); ctx.lineTo(dx + dw * 0.84, y + h * 0.28);
    ctx.stroke();
    // deux panneaux pleins en dessous
    ctx.strokeStyle = SOMBRE; ctx.lineWidth = 1.2 * sc;
    ctx.strokeRect(dx + dw * 0.16, y + h * 0.42, dw * 0.68, h * 0.20);
    ctx.strokeRect(dx + dw * 0.16, y + h * 0.66, dw * 0.68, h * 0.20);
  }
  // la poignée, sur le battant de droite
  ctx.fillStyle = '#e8c45a';
  ctx.beginPath(); ctx.arc(cx + ow + w * 0.07, y + h * 0.55, w * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// Où se trouve la cabine, selon la phase. ⚠ Source UNIQUE, partagée par le dessin et par la mise
// à jour : deux calculs séparés auraient fini par ouvrir les portes ailleurs que là où le
// doodler entre.
function doodleTardisPos(s) {
  const td = s.tardis;
  if (!td) return null;
  if (td.ph === 'rise') return { x: s.px, y: s.py + D_FEET };
  if (td.ph === 'drop' && td.tg && !td.tg.dead) return { x: td.tg.x + td.tg.w / 2, y: td.tg.y };
  if (td.ph === 'drop') return { x: s.px, y: s.py + D_FEET };
  return { x: td.bx, y: td.p && !td.p.dead ? td.p.y : s.py + D_FEET };
}
// L'écartement des portes à cet instant : elles s'ouvrent, laissent passer, puis se referment.
function doodleTardisOpen(s) {
  const td = s.tardis;
  if (!td) return 0;
  if (td.ph === 'load') { const u = td.t / D_TARDIS_LOAD; return u < 0.35 ? u / 0.35 : u > 0.70 ? Math.max(0, 1 - (u - 0.70) / 0.30) : 1; }
  if (td.ph === 'drop') { const u = td.t / D_TARDIS_DROP; return u < 0.30 ? u / 0.30 : u > 0.75 ? Math.max(0, 1 - (u - 0.75) / 0.25) : 1; }
  return 0;
}
// 🌪️ LE FIL barbelé : un toron d'acier le long d'une polyligne, et ses barbillons en croix
// plantés à intervalle régulier. ⚠ Primitive PARTAGÉE par les quatre états du fil (tendu sur la
// dalle, arraché, en ruée, refermé en anneau) : c'est le MÊME fil du début à la fin, et c'est
// ce qui rend l'animation lisible. Deux dessins séparés et l'on n'aurait pas reconnu, dans ce
// qui tourne autour de soi, ce qui vient de quitter la dalle.
function doodleBarbWire(ctx, pts, closed) {
  if (!pts || pts.length < 2) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = () => {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (closed) ctx.closePath();
  };
  ctx.strokeStyle = '#6d737d'; ctx.lineWidth = 3;   path(); ctx.stroke();   // l'ombre du toron
  ctx.strokeStyle = '#d5dae1'; ctx.lineWidth = 1.5; path(); ctx.stroke();   // l'acier éclairé
  // Les barbillons : deux traits croisés, penchés dans l'axe du fil — c'est ce croisement, et
  // pas une simple pointe, qui fait lire « barbelé » à cette taille. ⚠ Espacés en LONGUEUR
  // D'ARC (D_BARB_GAP px) et non tous les n points : la même polyligne sert à un fil de 62 px
  // et à un anneau de 250 px de tour, et un pas en indices aurait donné des barbillons collés
  // sur l'un et clairsemés sur l'autre.
  const barb = [];
  let acc = D_BARB_GAP * 0.5;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc < D_BARB_GAP) continue;
    acc = 0;
    const a = pts[Math.min(pts.length - 1, i + 1)], b = pts[i - 1];
    const dx = a.x - b.x, dy = a.y - b.y, n = Math.hypot(dx, dy) || 1;
    barb.push({ p: pts[i], tx: dx / n, ty: dy / n });
  }
  // Deux passes, comme le toron : l'ombre porte la forme sur le fond crème, l'acier la rallume.
  for (const [col, lw, L] of [['#5c626c', 2.6, 5.4], ['#e6eaf0', 1.1, 5]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    for (const b of barb) {
      const nx = -b.ty, ny = b.tx;
      for (const sg of [1, -1]) {
        const ux = nx + b.tx * 0.5 * sg, uy = ny + b.ty * 0.5 * sg;
        ctx.moveTo(b.p.x + ux * L, b.p.y + uy * L);
        ctx.lineTo(b.p.x - ux * L, b.p.y - uy * L);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}
// Le fil TENDU sur la dalle : d'un bord à l'autre (100 % de la tuile), avec la flèche que prend
// un fil tendu entre deux poteaux.
function doodleBarbLinePts(x, y, w) {
  const pts = [];
  for (let i = 0; i <= D_BARB_SEG; i++) {
    const u = i / D_BARB_SEG;
    pts.push({ x: x + u * w, y: y - 4 + Math.sin(u * Math.PI) * 2 });
  }
  return pts;
}
// Le fil ENROULÉ en anneau. ⚠ Même paramétrage `u` que la ligne : c'est ce qui permet
// d'interpoler point à point de l'un à l'autre pendant le décollement.
function doodleBarbRingPts(cx, cy, r, rot) {
  const pts = [];
  for (let i = 0; i <= D_BARB_SEG; i++) {
    const a = rot + i / D_BARB_SEG * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}
// Les points du fil à cet instant. Pendant 'peel', mélange point à point entre la dalle et
// l'anneau, LA DROITE D'ABORD (`u = 1` est le bord droit) : le décollement remonte vers la
// gauche, et le fil n'est jamais coupé en deux morceaux.
function doodleBarbPts(bb) {
  const ring = doodleBarbRingPts(bb.cx, bb.cy, bb.r, bb.a);
  const q = bb.p;
  if (bb.ph !== 'peel' || !q) return ring;
  const line = doodleBarbLinePts(q.x, q.y, q.w);
  const out = [];
  for (let i = 0; i <= D_BARB_SEG; i++) {
    const u = i / D_BARB_SEG;
    const m = Math.max(0, Math.min(1, (u - (1 - bb.k)) * 4 + bb.k * bb.k));
    out.push({ x: line[i].x + (ring[i].x - line[i].x) * m, y: line[i].y + (ring[i].y - line[i].y) * m });
  }
  return out;
}
// 💥 L'EXPLOSION : le fil ne revient plus se poser, il se dépense en aiguilles lancées en
// étoile depuis l'anneau. ⚠ Les aiguilles partent dans `s.bullets` — c'est déjà le tableau qui
// défile avec le monde et qui sait mordre créatures et boss ; un tableau de plus aurait
// dupliqué tout cela pour rien.
function doodleBarbBurst(s, bb) {
  for (let i = 0; i < D_BARB_NEEDLES; i++) {
    const a = bb.a + i / D_BARB_NEEDLES * Math.PI * 2;
    s.bullets.push({ x: bb.cx + Math.cos(a) * bb.r, y: bb.cy + Math.sin(a) * bb.r,
                     vx: Math.cos(a) * D_BARB_NEEDLE_V, vy: Math.sin(a) * D_BARB_NEEDLE_V,
                     pierce: 0, boom: false, laser: false, sz: doodleBigMul(s), needle: true });
  }
  for (let n = 0; n < 20; n++) {
    const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3.5;
    s.parts.push({ x: bb.cx + Math.cos(a) * bb.r, y: bb.cy + Math.sin(a) * bb.r, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 22, max: 22, sz: 2.5, c: n % 2 ? '#c3c8d0' : '#eef2f6' });
  }
  s.toast = { txt: `🌪️ Le fil explose — ${D_BARB_NEEDLES} aiguilles`, life: D_TOAST_LIFE };
}
// 🔥 UNE LANGUE DE FEU, tracée point par point. ⚠ 12.7.5 — L'ancienne flamme était UNE goutte
// symétrique dont la hauteur suivait UNE sinusoïde : à l'œil, ça bat en cadence, on lit un
// clignotement et jamais du feu. Trois corrections, toutes visibles :
//   · TROIS fréquences décalées (0,13 / 0,31 / 0,07) au lieu d'une — le battement ne se répète
//     plus à vue d'œil, alors que le dessin reste DÉTERMINISTE (t + abscisse), sans particules
//     à mémoriser sur une dalle qui vit des dizaines de secondes ;
//   · la langue se PENCHE d'autant plus qu'elle monte (`u²`) et ondule sur sa hauteur : la
//     turbulence emporte la pointe, elle ne monte pas droit ;
//   · TROIS couches — halo rouge sombre, corps orange, cœur presque blanc plus court — au lieu
//     de deux : c'est le dégradé du bas vers le haut qui donne la chaleur.
function doodleFlameLick(ctx, fx, baseY, t, ph, sc) {
  const k = sc == null ? 1 : sc;
  const puls = 0.55 + 0.25 * Math.sin(t * 0.13 + ph) + 0.14 * Math.sin(t * 0.31 + ph * 2.3) + 0.09 * Math.sin(t * 0.07 + ph * 0.7);
  const fh = (9 + puls * 17) * k;
  const lean = Math.sin(t * 0.09 + ph * 1.3) * 3.4 + Math.sin(t * 0.23 + ph) * 1.6;
  const N = 7;
  const lick = (h0, wid, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let side = 0; side < 2; side++) {
      for (let j = 0; j <= N; j++) {
        const u = side ? 1 - j / N : j / N;
        // axe de la langue : penché en u² (la pointe part la première) et ondulé sur la hauteur
        const ax = fx + lean * u * u + Math.sin(t * 0.19 + ph + u * 3.4) * 1.6 * u;
        // largeur : ventrue au tiers bas, effilée à la pointe — un cône droit fait une bougie
        const wd = wid * (1 - u) * (0.45 + 0.75 * Math.sin(Math.min(1, (1 - u) * 1.6) * Math.PI * 0.5));
        const px = ax + (side ? wd : -wd), py = baseY - h0 * u;
        (side || j) ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
    }
    ctx.closePath(); ctx.fill();
  };
  lick(fh, 5 * k, 'rgba(198,48,8,0.5)');            // le halo qui rougeoie autour
  lick(fh * 0.88, 3.6 * k, 'rgba(255,116,24,0.92)');  // le corps
  lick(fh * 0.5, 2 * k, 'rgba(255,232,140,0.95)');    // le cœur, presque blanc
}
function doodleTileDraw(ctx, p, t) {
  const x = p.x, y = p.y, w = p.w, h = p.h;
  // 🔋 Recharge : pile posée sur la dalle, avec ses barres de charge qui se remplissent en
  // boucle et son éclair — l'image dit à la fois « munitions » et « ça revient ».
  if (p.type === 'recharge') {
    doodleRR(ctx, x, y, w, h, 6, '#3f6f4a');
    ctx.fillStyle = '#22432a'; ctx.fillRect(x, y + h - 4, w, 4);
    const bx = x + 10, bw = w - 26, by = y + 3, bh = h - 9;
    doodleRR(ctx, bx, by, bw, bh, 2.5, '#e8f0e2');                       // le corps de la pile
    ctx.fillStyle = '#e8f0e2'; ctx.fillRect(bx + bw, by + bh * 0.28, 3, bh * 0.44);   // la borne +
    const lvl = ((t * 0.03) % 1);                                        // la charge, qui monte en boucle
    ctx.fillStyle = '#7ed957';
    for (let i = 0; i < 3; i++) {
      if (i / 3 > lvl) continue;
      ctx.fillRect(bx + 2 + i * (bw - 4) / 3, by + 2, (bw - 4) / 3 - 1.5, bh - 4);
    }
    ctx.fillStyle = '#ffd54a';                                           // l'éclair
    const ex = x + w - 9, ey = y + h / 2;
    ctx.beginPath(); ctx.moveTo(ex + 1.5, ey - 5); ctx.lineTo(ex - 2.5, ey + 0.5); ctx.lineTo(ex + 0.2, ey + 0.5); ctx.lineTo(ex - 1.5, ey + 5); ctx.lineTo(ex + 2.8, ey - 1); ctx.lineTo(ex + 0.2, ey - 1); ctx.closePath(); ctx.fill();
    return;
  }
  // 🚩 Drapeau : mât planté sur la dalle et drapeau hissé AU-DESSUS, à partir de la grille de
  // pixels du catalogue. ⚠ Dessiné hors de la boîte de la dalle, comme l'antenne du 📡 Arc :
  // ramené à 62 × 14, un drapeau de 15 × 10 cases n'aurait plus été qu'un empilement de traits.
  // ⚠ 10.6.8 — Il lit `cellsLo` (15 × 10) et NON la grille du jeu, passée à 30 × 20 : à
  // 28 × 18 px à l'écran, 600 rectangles par dalle et par frame auraient coûté quatre fois
  // plus cher pour un détail plus fin que le pixel qui l'affiche.
  if (p.type === 'flag') {
    doodleRR(ctx, x, y, w, h, 6, '#c9ced6');
    ctx.fillStyle = '#8f97a4'; ctx.fillRect(x, y + h - 4, w, 4);
    const px2 = x + 8, top = y - D_FLAG_H - 2;
    ctx.fillStyle = '#6b4520'; ctx.fillRect(px2 - 1.4, top, 2.8, D_FLAG_H + h - 2);        // le mât
    ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(px2, top - 2, 2, 0, Math.PI * 2); ctx.fill();
    const f = doodleFlagOf(p);
    if (f && f.cellsLo) {
      const cw = D_FLAG_W / FLAG_COLS_LO, chh = D_FLAG_H / FLAG_ROWS_LO;
      // Ondulation : chaque colonne est décalée verticalement, le drapeau « flotte ».
      for (let cxi = 0; cxi < FLAG_COLS_LO; cxi++) {
        const off = Math.sin(t * 0.11 - cxi * 0.5) * (cxi / FLAG_COLS_LO) * 2.2;
        for (let cyi = 0; cyi < FLAG_ROWS_LO; cyi++) {
          ctx.fillStyle = FLAG_PAL[f.cellsLo[cyi * FLAG_COLS_LO + cxi]] || '#f4f4f4';
          ctx.fillRect(px2 + 1.4 + cxi * cw, top + cyi * chh + off, cw + 0.6, chh + 0.6);
        }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
      ctx.strokeRect(px2 + 1.4, top, D_FLAG_W, D_FLAG_H);
    } else { ctx.fillStyle = '#e2564a'; ctx.fillRect(px2 + 1.4, top, D_FLAG_W, D_FLAG_H); }
    return;
  }
  // 🔔 Notif : dalle façon écran de téléphone, avec sa pastille rouge et son chiffre — c'est
  // l'image la plus immédiate de « tu vas recevoir quelque chose ».
  if (p.type === 'notif') {
    doodleRR(ctx, x, y, w, h, 6, '#3a3f4a');
    ctx.fillStyle = '#22252c'; ctx.fillRect(x, y + h - 4, w, 4);
    doodleRR(ctx, x + w / 2 - 15, y + 2, 30, h - 7, 4, '#8f97a4');       // l'écran
    ctx.fillStyle = '#c9ced6';
    ctx.fillRect(x + w / 2 - 11, y + 5, 22, 1.6);
    ctx.fillRect(x + w / 2 - 11, y + 8.5, 15, 1.6);
    const pop = p.used ? 0 : 1 + Math.abs(Math.sin(t * 0.12)) * 0.6;     // la pastille pulse tant qu'elle n'a pas servi
    if (!p.used) {
      ctx.fillStyle = '#e2564a';
      ctx.beginPath(); ctx.arc(x + w / 2 + 14, y + 3, 4 * pop / 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; ctx.fillText('1', x + w / 2 + 14, y + 3.4);
      ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    if (p.used) doodleTileSpent(ctx, p);
    return;
  }
  // 🪺 Œuf : nid de brindilles et œuf posé dessus, FISSURÉ à mesure que le compte à rebours
  // descend — c'est le seul moyen de savoir qu'il est sur le point d'éclore. Éclos, il ne reste
  // que la coquille brisée ; couvé, l'œuf est intact et vert pâle.
  if (p.type === 'egg') {
    const left = p.egg == null ? D_EGG_JUMPS : p.egg, cracks = Math.max(0, D_EGG_JUMPS - left);
    doodleRR(ctx, x, y, w, h, 6, '#b58a4a');
    ctx.fillStyle = '#8a5a2c'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.strokeStyle = '#8a5a2c'; ctx.lineWidth = 1.2;                    // les brindilles du nid
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x + 4 + i * 12, y + h - 4); ctx.lineTo(x + 12 + i * 12, y + 2); ctx.stroke(); }
    const cx = x + w / 2, cy = y + h / 2 - 1;
    if (p.hatched) {                                                     // coquille brisée
      ctx.fillStyle = '#f6efe2';
      ctx.beginPath(); ctx.moveTo(cx - 7, cy + 5); ctx.lineTo(cx - 5, cy); ctx.lineTo(cx - 2, cy + 4); ctx.lineTo(cx + 1, cy - 1); ctx.lineTo(cx + 4, cy + 4); ctx.lineTo(cx + 7, cy + 5); ctx.closePath(); ctx.fill();
      return;
    }
    ctx.fillStyle = p.saved ? '#cfe8d4' : '#f6efe2'; ctx.strokeStyle = '#c4a86a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(cx, cy, 5.6, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#a8845a'; ctx.lineWidth = 1;
    for (let i = 0; i < cracks; i++) {                                   // une fêlure par saut manqué
      const yy = cy - 4 + i * 2.6;
      ctx.beginPath(); ctx.moveTo(cx - 4, yy); ctx.lineTo(cx - 1, yy + 1.6); ctx.lineTo(cx + 2, yy - 0.6); ctx.lineTo(cx + 4.4, yy + 1.2); ctx.stroke();
    }
    if (!p.saved) {
      ctx.save(); ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#3a2a10'; ctx.fillText(String(left), x + w - 9, y + h / 2);
      ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    return;
  }
  // 🎨 Inverseuse : la dalle est coupée en deux moitiés strictement complémentaires, et les deux
  // moitiés PERMUTENT au fil du temps — c'est l'inversion elle-même, montrée en petit.
  if (p.type === 'negative') {
    const flip = Math.floor(t / 24) % 2;
    const a = flip ? '#1e2a3a' : '#e1d5c5', b = flip ? '#e1d5c5' : '#1e2a3a';
    doodleRR(ctx, x, y, w, h, 6, a);
    ctx.save(); ctx.beginPath(); ctx.rect(x + w / 2, y, w / 2, h); ctx.clip();
    doodleRR(ctx, x, y, w, h, 6, b);
    ctx.restore();
    ctx.fillStyle = b;                                          // les deux disques, eux aussi croisés
    ctx.beginPath(); ctx.arc(x + w * 0.28, y + h / 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = a;
    ctx.beginPath(); ctx.arc(x + w * 0.72, y + h / 2, 4, 0, Math.PI * 2); ctx.fill();
    return;
  }
  // 🕊️ Miséricordieuse : dalle claire portant une colombe stylisée, aile déployée. Épuisée,
  // elle prend le voile commun des tuiles à usage unique.
  if (p.type === 'mercy') {
    doodleRR(ctx, x, y, w, h, 6, '#dff0e6');
    ctx.fillStyle = '#8fbfa4'; ctx.fillRect(x, y + h - 4, w, 4);
    const cx = x + w / 2, cy = y + h / 2, fl = Math.sin(t * 0.09) * 2;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#5c8f76'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(cx - 2, cy + 1, 7, 4, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // le corps
    ctx.beginPath(); ctx.moveTo(cx - 1, cy - 1); ctx.quadraticCurveTo(cx + 4, cy - 7 - fl, cx + 9, cy - 1); ctx.quadraticCurveTo(cx + 4, cy + 1, cx - 1, cy - 1); ctx.fill(); ctx.stroke();   // l'aile
    ctx.fillStyle = '#e8913a';
    ctx.beginPath(); ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - 13, cy + 1.4); ctx.lineTo(cx - 9, cy + 2.2); ctx.closePath(); ctx.fill();   // le bec
    ctx.fillStyle = '#2b2b33'; ctx.beginPath(); ctx.arc(cx - 6.5, cy - 0.6, 1, 0, Math.PI * 2); ctx.fill();
    if (p.used) doodleTileSpent(ctx, p);
    return;
  }
  // 🌳 10.5.9 — ARBRE GÉANT REDESSINÉ (demande utilisateur : « il doit pousser au-dessus de la
  // tuile, pas en dessous »). Il poussait vers le BAS, houppier retourné sous la dalle : un
  // arbre qui pend est une racine, pas un arbre. Le tronc part maintenant du HAUT de la dalle
  // et le houppier le coiffe — l'image dit enfin ce que fait la tuile (plus il est haut, plus
  // elle renvoie haut).
  // ⚠ Dessiné AVANT la dalle : celle-ci recouvre le pied du tronc, ce qui le fait paraître
  // PLANTÉ dedans. Après, il aurait flotté au-dessus.
  // ⚠ Il ne masque pas la montée : les rangées supérieures sont poussées plus tard dans
  // `s.platforms` et se dessinent donc PAR-DESSUS lui. Sa hauteur n'est plus plafonnée — elle
  // EST la mécanique — mais la pousse s'arrête d'elle-même sur la rangée du dessus.
  // ⚠ Le balancement est en f² (nul au pied, maximal à la cime) : un décalage constant aurait
  // fait GLISSER l'arbre de côté au lieu de le faire plier.
  if (p.type === 'tree') {
    const n = p.tree || 0, cx = x + w / 2;
    // ⚠ Le dessin suit la HAUTEUR RÉELLE (`p.treeH`, poussée frame par frame) et non plus le
    // compteur de prises : c'est cette hauteur-là qui doit venir toucher la rangée du dessus.
    // `gr` n'est qu'une échelle de lecture (≈ une « pousse » tous les 12 px) qui redonne aux
    // proportions d'origine — tronc, branches, houppier — leur progression.
    const hh = Math.max(D_TREE_H0, p.treeH || 0), gr = hh / 12;
    const tw2 = Math.min(13, 3 + gr * 0.9);
    const swayMax = Math.sin(t * 0.035 + x * 0.07) * Math.min(7, 1 + gr * 0.45);
    const at = f => ({ x: cx + swayMax * f * f, y: y + 2 - hh * f, w: tw2 * (1 - f * 0.5) });
    ctx.save();
    // ── le tronc, fuselé et courbé ──
    const NS = 9;
    ctx.fillStyle = '#8a5a2c';
    ctx.beginPath();
    for (let i = 0; i <= NS; i++) { const q = at(i / NS); ctx.lineTo(q.x - q.w / 2, q.y); }
    for (let i = NS; i >= 0; i--) { const q = at(i / NS); ctx.lineTo(q.x + q.w / 2, q.y); }
    ctx.closePath(); ctx.fill();
    // veines d'écorce : deux traits qui suivent la courbe, sinon le tronc est un bâton uni
    ctx.strokeStyle = '#6b4520'; ctx.lineWidth = 1.1;
    [-0.22, 0.2].forEach(off => {
      ctx.beginPath();
      for (let i = 0; i <= NS; i++) { const q = at(i / NS); ctx.lineTo(q.x + q.w * off, q.y); }
      ctx.stroke();
    });
    // ── les branches : une toutes les deux pousses, alternées, avec leur bouquet de feuilles ──
    const nb = Math.min(4, Math.floor(gr / 2));
    for (let i = 0; i < nb; i++) {
      const f = 0.42 + i * 0.14, q = at(f), sg = i % 2 ? 1 : -1, bl = 7 + gr * 0.5;
      ctx.strokeStyle = '#6b4520'; ctx.lineWidth = Math.max(1.6, q.w * 0.28); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.quadraticCurveTo(q.x + sg * bl * 0.7, q.y - 2, q.x + sg * bl, q.y - bl * 0.55); ctx.stroke();
      ctx.fillStyle = '#4e9c33';
      ctx.beginPath(); ctx.arc(q.x + sg * bl, q.y - bl * 0.55, 3.4 + gr * 0.12, 0, Math.PI * 2); ctx.fill();
    }
    // ── le houppier, EN HAUT du tronc : trois épaisseurs pour lui donner du volume ──
    const tp = at(1), fr = Math.min(23, 5 + gr * 1.7);
    const clumps = [[0, -fr * 0.42, fr * 0.95], [-fr * 0.72, 0, fr * 0.72], [fr * 0.72, 0, fr * 0.72], [0, fr * 0.3, fr * 0.66]];
    ctx.fillStyle = '#2f6d1e';                                                   // l'ombre du feuillage
    clumps.forEach(([ox, oy, r]) => { ctx.beginPath(); ctx.arc(tp.x + ox, tp.y + oy + 2, r, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = hh > D_TREE_H0 ? '#4e9c33' : '#7ec850';                       // la masse
    clumps.forEach(([ox, oy, r]) => { ctx.beginPath(); ctx.arc(tp.x + ox, tp.y + oy, r, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = 'rgba(180,232,120,0.85)';                                     // la lumière, en haut à gauche
    ctx.beginPath(); ctx.arc(tp.x - fr * 0.35, tp.y - fr * 0.62, fr * 0.38, 0, Math.PI * 2); ctx.fill();
    // Fruits : ils n'apparaissent qu'une fois l'arbre bien parti — c'est la récompense qui se voit.
    if (gr >= 6) {
      ctx.fillStyle = '#e2564a';
      for (let i = 0; i < Math.min(5, Math.floor(gr) - 5); i++) {
        const a = 0.7 + i * 1.25;
        ctx.beginPath(); ctx.arc(tp.x + Math.cos(a) * fr * 0.62, tp.y + Math.sin(a) * fr * 0.55, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    // ── la dalle : terreau sombre surmonté d'herbe, pour qu'on lise « l'arbre pousse dedans » ──
    doodleRR(ctx, x, y, w, h, 6, '#6b4a2a');
    ctx.fillStyle = '#7ec850'; ctx.fillRect(x + 2, y, w - 4, 4);
    ctx.fillStyle = '#3f2d18'; ctx.fillRect(x, y + h - 4, w, 4);
    // Le collet : deux racines qui débordent sur la dalle, dessinées APRÈS elle.
    ctx.save(); ctx.strokeStyle = '#6b4520'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    [-1, 1].forEach(sg => { ctx.beginPath(); ctx.moveTo(cx, y + 3); ctx.quadraticCurveTo(cx + sg * (5 + tw2 * 0.4), y + 3, cx + sg * (9 + tw2 * 0.5), y + 7); ctx.stroke(); });
    ctx.restore();
    if (n > 0) {                                                                          // le compteur de pousses, sur la dalle
      ctx.save(); ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffe9a8'; ctx.fillText('×' + n, x + w - 12, y + h / 2 + 1);
      ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    return;
  }
  // 🔺 10.5.5 — FRACTALE REDESSINÉE (demande utilisateur : « le logo et le design in game ne me
  // conviennent pas »). Le flocon de givre bleu clair ne disait rien de la mécanique et se
  // confondait avec les autres dalles bleues du jeu (❄️ Gel, 💧 Eau, 🧊 du biome). La dalle est
  // maintenant VIOLETTE et DÉJÀ DÉCOUPÉE : le fond sombre transparaît par les fentes, et les
  // morceaux posés dessus sont exactement les filles à venir. ⚠ La découpe est RÉCURSIVE et
  // s'arrête quand un morceau tomberait sous 11 px — en dessous, la dalle se lisait comme un
  // peigne et on ne voyait plus les moitiés. Les petits triangles du haut comptent les
  // générations restantes : ils reprennent le 🔺 de l'icône, là où des pastilles rondes se
  // seraient lues comme les yeux de la 👀 Vivante.
  if (p.type === 'fractal') {
    const gen = p.gen || 0, left = Math.max(1, D_FRACT_GEN - gen);
    doodleRR(ctx, x, y, w, h, 5, '#3a2a6b');                         // le fond sombre = les fentes
    const piece = (px, pw, d) => {
      const gap = 1.1 * d;
      if (d > 0 && (pw - gap) / 2 >= 11) { piece(px, (pw - gap) / 2, d - 1); piece(px + (pw + gap) / 2, (pw - gap) / 2, d - 1); return; }
      doodleRR(ctx, px, y, pw, h, 4, '#a78bfa');
      ctx.fillStyle = '#6d4bc7'; ctx.fillRect(px, y + h - 4, pw, 4);
    };
    piece(x, w, left);
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#2a1e52'; ctx.lineWidth = 1.6; ctx.fillStyle = '#f0e9ff';
    for (let i = 0; i < left; i++) {
      const dx = x + w / 2 + (i - (left - 1) / 2) * 6.4, dy = y + 2.4;
      ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + 2.6, dy + 4.4); ctx.lineTo(dx - 2.6, dy + 4.4); ctx.closePath(); ctx.stroke(); ctx.fill();
    }
    return;
  }
  // 🐛 Buguée — ENSEIGNE CYBERPUNK : un panneau de carbone à coins CHANFREINÉS, lueur magenta
  // au sol, grille et pistes de circuit imprimé sous verre, réglette de code, et un balayage
  // lumineux qui le parcourt en continu. Par à-coups l'image DÉRAILLE — canaux de couleur
  // dédoublés, tranches décalées — puis se recompose.
  // ⚠ Le chanfrein ne mord QUE les coins du BAS : l'arête haute, seule ligne qu'on vise pour
  // atterrir, garde la largeur EXACTE de la dalle. Rognée, elle aurait promis moins de dalle
  // qu'il n'y en a.
  // ⚠ Le déraillement est INTERMITTENT (D_GLITCH_BREAK) là où il était permanent : à longueur
  // de temps, trois canaux décalés se mélangent en une bouillie grise et le panneau ne se lit
  // plus. Il faut du propre pour que le cassé se voie.
  // ⚠ TOUT le parasitage reste rythmé par paliers de D_GLITCH_STEP frames et tiré du bruit
  // DÉTERMINISTE `doodleNz` semé sur l'abscisse de la dalle : retiré à chaque frame, l'image
  // clignotait au lieu de grésiller, et deux buguées à l'écran auraient déraillé à l'unisson.
  // ⚠ Le balayage, LUI, est continu : ce n'est pas un parasite mais un scan, et un scan qui
  // saute de palier en palier ne se lit plus comme un déplacement.
  // ⚠ Tout l'intérieur est ÉCRÊTÉ au chanfrein (`clip`) : débordant, il dessinait un pixel de
  // dalle là où il n'y en a pas, et on saute là où l'on voit.
  if (p.type === 'glitch') {
    // Le décrochage : rien du tout à l'écran, le temps d'un palier. La dalle, elle, est
    // toujours là et porte toujours (voir D_GLITCH_BLINK).
    if (doodleGlitchGone(p, t)) return;
    const gb = Math.floor((t || 0) / D_GLITCH_STEP), sd = p.x * 0.017;
    const brk = doodleNz(gb * 2.3 + sd) < D_GLITCH_BREAK;      // ce palier-ci déraille-t-il ?
    const ch = Math.min(5, h * 0.42);                          // profondeur du chanfrein
    const body = () => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - ch); ctx.lineTo(x + w - ch, y + h); ctx.lineTo(x + ch, y + h); ctx.lineTo(x, y + h - ch); ctx.closePath(); };
    // La lueur au sol : trois halos magenta empilés sous le socle. ⚠ Des rectangles
    // translucides et non un `shadowBlur` — le flou de canvas se paie sur CHAQUE dalle et à
    // CHAQUE frame, pour un rendu qu'on ne distingue pas à cette taille.
    ctx.save(); ctx.globalAlpha = 0.11; ctx.fillStyle = '#ff2fb0';
    for (let g = 1; g <= 3; g++) ctx.fillRect(x + g * 2, y + h - 2, w - g * 4, g * 2.2);
    ctx.restore();
    ctx.save();
    body(); ctx.clip();
    // Le carbone : dégradé du violet profond au noir bleuté.
    const bg = ctx.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, '#191142'); bg.addColorStop(1, '#05060f');
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
    // Grille fine, puis deux pistes coudées avec leur pastille de soudure : le circuit qu'on
    // devine sous le verre. Leur tracé est tiré du bruit semé sur l'abscisse ⇒ propre à la dalle.
    ctx.globalAlpha = 0.14; ctx.fillStyle = '#3ef2f2';
    for (let gx = x + 4; gx < x + w - 2; gx += 6) ctx.fillRect(gx, y + 1, 1, h - 2);
    ctx.globalAlpha = 0.6; ctx.strokeStyle = '#2ad2b0'; ctx.fillStyle = '#2ad2b0'; ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const ty = y + 4.5 + i * 5, tx0 = x + 4 + doodleNz(i * 9.1 + sd) * (w * 0.3), tx1 = tx0 + 8 + doodleNz(i * 4.7 + sd) * 15, dy2 = i ? -3 : 3;
      ctx.beginPath(); ctx.moveTo(tx0, ty); ctx.lineTo(tx1, ty); ctx.lineTo(tx1 + 3, ty + dy2); ctx.lineTo(x + w - 3, ty + dy2); ctx.stroke();
      ctx.fillRect(tx0 - 1.5, ty - 1.5, 3, 3);
    }
    // Réglette de « code » : des glyphes de 2 px, certains allumés. ⚠ C'est le seul motif qui
    // bouge au rythme des paliers quand la dalle ne déraille pas — sans lui, elle aurait l'air
    // éteinte entre deux déraillements.
    for (let i = 0; i < 9; i++) {
      const n1 = doodleNz(gb * 0.7 + i * 3.1 + sd);
      if (n1 > 0.55) continue;
      ctx.globalAlpha = 0.45 + n1;
      ctx.fillStyle = i % 3 === 0 ? '#39ff6a' : i % 3 === 1 ? '#3ef2f2' : '#ff2fb0';
      ctx.fillRect(x + 4 + i * 6, y + 7 + Math.floor(n1 * 3) * 2, 1 + Math.floor(n1 * 6), 2);
    }
    ctx.globalAlpha = 1;
    // Le balayage : une lame de lumière qui traverse le panneau et traîne derrière elle.
    // ⚠ Décalée de `p.x` : deux buguées côte à côte scannaient sinon en même temps.
    const sw = ((t || 0) * 0.9 + p.x) % (w + 34) - 17;
    const sg = ctx.createLinearGradient(x + sw - 12, 0, x + sw + 5, 0);
    sg.addColorStop(0, 'rgba(62,242,242,0)'); sg.addColorStop(0.7, 'rgba(62,242,242,0.17)'); sg.addColorStop(1, 'rgba(226,255,255,0.42)');
    ctx.fillStyle = sg; ctx.fillRect(x + sw - 12, y, 17, h);
    // Lignes de balayage.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let ly = y + 1; ly < y + h - 1; ly += 3) ctx.fillRect(x, ly, w, 1);
    if (brk) {
      // Le déraillement : les canaux glissent, cyan d'un côté, magenta de l'autre — en
      // `lighter`, parce que trois calques de couleur POSÉS s'éteignent l'un l'autre au lieu
      // de s'additionner comme le fait la lumière d'un écran.
      // ⚠ Le vert glisse MOINS que les deux autres : à décalage égal, les trois se recouvrent
      // et la dalle vire à l'aplat vert — ce n'est plus un glissement, c'est une couleur.
      const off = 1.5 + doodleNz(gb + sd) * 3;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#00e5ff'; ctx.fillRect(x - off, y + 1, w, h - 2);
      ctx.fillStyle = '#ff2fb0'; ctx.fillRect(x + off, y + 1, w, h - 2);
      ctx.fillStyle = '#39ff6a'; ctx.fillRect(x + off * 0.45, y + 1, w, h - 2);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      // Déchirures : deux tranches de l'image redessinées, décalées horizontalement.
      for (let i = 0; i < 2; i++) {
        const n2 = doodleNz(gb * 1.3 + i * 11.7 + sd);
        if (n2 > 0.6) continue;
        const ty = y + 1 + n2 * (h - 5), th = 2 + doodleNz(gb + i) * 3, dx2 = (doodleNz(gb * 2.1 + i * 4.4 + sd) - 0.5) * 14;
        ctx.fillStyle = '#0a0a18'; ctx.fillRect(x + dx2, ty, w, th);
        ctx.fillStyle = i ? 'rgba(57,255,106,0.85)' : 'rgba(255,47,176,0.85)';
        ctx.fillRect(x + dx2, ty, w, 1);
      }
    }
    ctx.restore();
    // Le cadre du panneau. ⚠ Hors du `clip` : écrêté, un trait posé SUR le bord perd la moitié
    // de son épaisseur et le chanfrein redevient un simple coin sombre.
    ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = '#3ef2f2'; ctx.lineWidth = 1; body(); ctx.stroke(); ctx.restore();
    // Le socle néon, tendu entre les deux chanfreins.
    ctx.fillStyle = '#ff2fb0'; ctx.fillRect(x + ch, y + h - 2.5, w - ch * 2, 2.5);
    ctx.fillStyle = '#3ef2f2'; ctx.fillRect(x + ch, y + h - 3.5, w - ch * 2, 1);   // un filet cyan sous le socle magenta
    // L'arête haute — la seule ligne qu'on vise pour atterrir — est elle-même FENDUE en deux
    // canaux, vert et cyan, à un point tiré du bruit : c'est là que le glissement des couleurs
    // se voit le mieux, et ça garantit les trois néons présents même sur un palier calme.
    const cut = 0.25 + doodleNz(gb * 1.9 + sd) * 0.5;
    ctx.fillStyle = '#39ff6a'; ctx.fillRect(x, y, w * cut, 1.6);
    ctx.fillStyle = '#3ef2f2'; ctx.fillRect(x + w * cut, y, w * (1 - cut), 1.6);
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#39ff6a'; ctx.fillRect(x, y - 1.4, w * cut, 1.4); ctx.fillStyle = '#3ef2f2'; ctx.fillRect(x + w * cut, y - 1.4, w * (1 - cut), 1.4); ctx.globalAlpha = 1;   // sa lueur au-dessus
    // La tête du balayage court sur l'arête, en blanc : c'est elle qui donne au panneau l'air
    // ALIMENTÉ plutôt que peint.
    ctx.fillStyle = '#eaffff'; ctx.fillRect(x + Math.max(0, Math.min(w - 5, sw - 3)), y - 0.5, 5, 2.1);
    return;
  }
  // ☯️ Yin et Yang : dalle grise, et le symbole en grand au centre — deux moitiés séparées par
  // une double courbe, chacune portant l'œil de l'autre. ⚠ Le disque est dessiné à SA taille
  // réelle (rayon dérivé de la hauteur de dalle) et non en pixels fixes : la dalle change de
  // largeur d'un biome à l'autre, un symbole figé serait tantôt écrasé, tantôt perdu.
  // ⚠ Il TOURNE lentement : c'est le seul indice qui le distingue d'un décor peint dessus.
  // 🔍 Zoom — une loupe posée sur la dalle. ⚠ Tant que la dalle n'a pas servi, le verre porte
  // un « ± » : elle ne doit rien promettre, le sens est tiré au moment du rebond. Une fois
  // jouée, elle affiche le signe qu'elle a donné et se grise — on lit d'un coup d'œil ce
  // qu'on a pris, et qu'il n'y a plus rien à en tirer.
  if (p.type === 'zoom') {
    const z = p.zoomed || 0, cx = x + w / 2, cy = y + h / 2;
    doodleRR(ctx, x, y, w, h, 6, '#3f6b7a');
    ctx.fillStyle = '#24424d'; ctx.fillRect(x, y + h - 4, w, 4);
    // Le manche, en biais sous le verre.
    ctx.strokeStyle = '#8a5a2c'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + 5, cy + 3); ctx.lineTo(cx + 15, cy + 9); ctx.stroke();
    ctx.strokeStyle = '#c08a52'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx + 6, cy + 2.4); ctx.lineTo(cx + 14, cy + 7.6); ctx.stroke();
    // Le verre, et son reflet.
    ctx.fillStyle = 'rgba(214,240,250,0.9)';
    ctx.beginPath(); ctx.arc(cx - 2, cy - 1, 7.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#cfd8de'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.strokeStyle = '#8e9aa2'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(cx - 5, cy - 4, 2.6, 1.5, -0.7, 0, Math.PI * 2); ctx.fill();
    // Le signe : « + », « − », ou le « ± » de la dalle encore neuve.
    ctx.strokeStyle = '#1d3a44'; ctx.lineWidth = 2; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(cx - 5.4, cy - 1); ctx.lineTo(cx + 1.4, cy - 1); ctx.stroke();   // la barre du − / du +
    if (z >= 0) { ctx.beginPath(); ctx.moveTo(cx - 2, cy - 4.4); ctx.lineTo(cx - 2, cy + 2.4); ctx.stroke(); }
    if (z === 0) { ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx - 5.4, cy + 3.4); ctx.lineTo(cx + 1.4, cy + 3.4); ctx.stroke(); }   // la 2e barre du ±
    if (z !== 0) doodleTileSpent(ctx, p);
    return;
  }
  // 🎋 Bambou — une CANNE couchée : segments verts cerclés de nœuds sombres, avec le reflet
  // clair de la tige. La tuile SOURCE (`bamboo`) pousse en plus trois jeunes chaumes feuillus
  // au-dessus, et c'est la seule différence : la dalle qu'elle convertit doit se reconnaître
  // comme du bambou au premier coup d'œil, sans qu'on la confonde avec celle qui convertit.
  if (p.type === 'bamboo' || p.type === 'bambooed') {
    const src = p.type === 'bamboo', cx = x + w / 2;
    if (src) {
      // Trois chaumes qui montent derrière la canne, avec leurs feuilles — ils débordent vers
      // le haut, hors de la boîte, comme le mât du 🚩 Drapeau.
      ctx.save(); ctx.lineCap = 'round';
      [[-19, 21, 0.9], [0, 30, 1], [17, 25, 0.8]].forEach(([dx, hgt, sc], i) => {
        const bx = cx + dx + Math.sin(t * 0.02 + i * 2.1) * 2.2;
        ctx.strokeStyle = '#4e9c33'; ctx.lineWidth = 3.4 * sc;
        ctx.beginPath(); ctx.moveTo(cx + dx, y + 4); ctx.lineTo(bx, y - hgt); ctx.stroke();
        ctx.strokeStyle = '#2f6b23'; ctx.lineWidth = 1.2;                    // les nœuds du chaume
        for (let k = 1; k <= 2; k++) {
          const yy = y + 4 - (hgt + 4) * k / 3, xx = cx + dx + (bx - (cx + dx)) * (k / 3);
          ctx.beginPath(); ctx.moveTo(xx - 2.4 * sc, yy); ctx.lineTo(xx + 2.4 * sc, yy); ctx.stroke();
        }
        ctx.fillStyle = '#7bbf3a'; ctx.strokeStyle = '#2f6b23'; ctx.lineWidth = 1;
        [-1, 1].forEach(sx => {
          ctx.beginPath();
          ctx.ellipse(bx + sx * 5.5, y - hgt + 3, 6, 2.4, sx * -0.6, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        });
      });
      ctx.restore();
    }
    // La canne couchée, qui EST la plateforme.
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#a8d86a'); g.addColorStop(0.42, '#6fbf47'); g.addColorStop(1, '#3f7d28');
    doodleRR(ctx, x, y, w, h, h / 2, '#6fbf47');
    ctx.save();
    doodleRR(ctx, x, y, w, h, h / 2, 'rgba(0,0,0,0)'); ctx.clip();
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y + 2.5, w, 2.4);   // le reflet de la tige
    ctx.strokeStyle = '#2f6b23'; ctx.lineWidth = 2.4;                              // les nœuds
    for (let i = 1; i < 4; i++) {
      const nx = x + i * w / 4;
      ctx.beginPath(); ctx.moveTo(nx, y - 1); ctx.lineTo(nx, y + h + 1); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(nx + 2, y - 1); ctx.lineTo(nx + 2, y + h + 1); ctx.stroke();
      ctx.strokeStyle = '#2f6b23'; ctx.lineWidth = 2.4;
    }
    ctx.restore();
    ctx.strokeStyle = '#2f6b23'; ctx.lineWidth = 1.3;
    doodleRR(ctx, x + 0.6, y + 0.6, w - 1.2, h - 1.2, h / 2, 'rgba(0,0,0,0)'); ctx.stroke();
    // ⚠ Ressort et trampoline redessinés ICI : `doodlePlatform` ne les pose qu'après la
    // fabrique des tuiles, dont on sort par un `return`. Aucune autre tuile n'en porte — mais
    // une dalle CONVERTIE, elle, vient souvent d'une verte ou d'une bleue qui en avait un, et
    // il continue de propulser. Un ressort qui agit sans se voir, c'est un saut inexpliqué.
    if (p.spring) doodleSpring(ctx, cx, y);
    if (p.trampoline) doodleTrampoline(ctx, cx, y);
    return;
  }
  // ☯️ Yin et Yang — DESSIN REPRIS DE ZÉRO (10.8.7, demande utilisateur). Plus de médaillon
  // taijitu : la dalle EST le pacte. Elle est coupée en deux par une couture oblique qui
  // OSCILLE lentement — la balance penche d'un côté puis de l'autre, ce qui dit l'échange bien
  // mieux qu'un symbole qui tourne sur lui-même.
  // ⚠ Côté clair = ce qu'on GAGNE (les bonus), côté sombre = ce qu'on PAIE (les créatures), et
  // chacun porte sa marque : un plus doré, une bestiole cornue. Deux moitiés sans marque, ce
  // n'était qu'une dalle bicolore de plus.
  // ⚠ Tout est CONTENU dans la boîte de la dalle : l'ancien médaillon débordait vers le haut et
  // se confondait avec le doodler qui vient s'y poser.
  if (p.type === 'yinyang') {
    const tt = t || 0, tilt = Math.sin(tt * 0.02) * 7, cx = x + w / 2, cy = y + h / 2;
    ctx.save();
    doodleRR(ctx, x, y, w, h, 6, '#f2ece0');                       // la moitié claire, en fond
    ctx.save();                                                     // la moitié sombre, découpée à la couture
    ctx.beginPath(); ctx.moveTo(x, y); doodleRR(ctx, x, y, w, h, 6, 'rgba(0,0,0,0)'); ctx.clip();
    ctx.fillStyle = '#16181e';
    ctx.beginPath();
    ctx.moveTo(cx + tilt - 4, y - 2); ctx.lineTo(x + w + 2, y - 2);
    ctx.lineTo(x + w + 2, y + h + 2); ctx.lineTo(cx - tilt + 4, y + h + 2);
    ctx.closePath(); ctx.fill();
    // La couture : un trait qui passe de l'or au carmin, avec sa lueur.
    const g = ctx.createLinearGradient(cx + tilt, y, cx - tilt, y + h);
    g.addColorStop(0, '#ffd54a'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#e2564a');
    ctx.strokeStyle = g; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + tilt - 4, y - 2); ctx.lineTo(cx - tilt + 4, y + h + 2); ctx.stroke();
    ctx.globalAlpha = 0.28 + Math.sin(tt * 0.09) * 0.16;
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(cx + tilt - 4, y - 2); ctx.lineTo(cx - tilt + 4, y + h + 2); ctx.stroke();
    ctx.restore();
    // ➕ Côté clair : le gain. Une croix dorée et deux éclats qui montent.
    ctx.fillStyle = '#c9992a';
    ctx.fillRect(x + 12, cy - 1.4, 9, 2.8); ctx.fillRect(x + 15.1, cy - 4.5, 2.8, 9);
    ctx.globalAlpha = 0.4 + Math.sin(tt * 0.11) * 0.35;
    [[7, -3.5], [26, 3]].forEach(([dx, dy], i) => {
      const yy = cy + dy - ((tt * 0.5 + i * 9) % 11) * 0.4;
      ctx.beginPath(); ctx.arc(x + dx, yy, 1.5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    // 👹 Côté sombre : le prix. Une bestiole cornue à œil unique, tapie dans le noir.
    const mx = x + w - 17;
    ctx.fillStyle = '#c4382e';
    ctx.beginPath();
    ctx.moveTo(mx - 6, cy + 4); ctx.lineTo(mx - 6, cy - 1);
    ctx.lineTo(mx - 8, cy - 6); ctx.lineTo(mx - 3, cy - 2.5);
    ctx.lineTo(mx + 3, cy - 2.5); ctx.lineTo(mx + 8, cy - 6);
    ctx.lineTo(mx + 6, cy - 1); ctx.lineTo(mx + 6, cy + 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = Math.floor(tt / 22) % 2 ? '#ffe9a8' : '#16181e';
    ctx.beginPath(); ctx.arc(mx, cy, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#3a3f49'; ctx.lineWidth = 1.4;
    doodleRR(ctx, x + 0.7, y + 0.7, w - 1.4, h - 1.4, 6, 'rgba(0,0,0,0)'); ctx.stroke();
    if (p.used) doodleTileSpent(ctx, p);
    return;
  }
  // 🎯 Quête : parchemin beige roulé aux deux bouts, marqué d'une cible. Épuisée, elle prend le
  // voile commun des tuiles à usage unique.
  if (p.type === 'quest') {
    doodleRR(ctx, x, y, w, h, 5, '#efe0b8');
    ctx.fillStyle = '#c4a86a'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillStyle = '#d8c088';
    [x + 3, x + w - 8].forEach(rx => doodleRR(ctx, rx, y - 1, 5, h + 2, 2.5, '#d8c088'));   // les rouleaux
    const cx = x + w / 2, cy = y + h / 2;
    [[6.5, '#e2564a'], [4, '#f6efe2'], [1.8, '#e2564a']].forEach(([r, col]) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    });
    if (p.used) doodleTileSpent(ctx, p);
    return;
  }
  // 👀 Vivante : dalle de chair rose, deux gros yeux dont les pupilles SUIVENT le doodler
  // (`lookX`/`lookY`, calculés dans la boucle) et une bouche qui respire.
  if (p.type === 'alive') {
    const lx = p.lookX || 0, ly = p.lookY == null ? 1 : p.lookY;
    doodleRR(ctx, x, y, w, h, 8, '#e08a9a');
    ctx.fillStyle = '#a8556a'; ctx.fillRect(x + 2, y + h - 4, w - 4, 4);
    [-11, 11].forEach(ox => {
      const cx = x + w / 2 + ox, cy = y + h / 2 - 1;
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#7a3348'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(cx, cy, 5.4, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2b2b33';
      ctx.beginPath(); ctx.arc(cx + lx * 2.4, cy + ly * 2.2, 2.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(cx + lx * 2.4 - 0.8, cy + ly * 2.2 - 0.9, 0.8, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = '#7a3348';                                        // la bouche, qui respire
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h - 5, 5, 1.2 + Math.abs(Math.sin(t * 0.06)) * 1.4, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  // 🩹 Pot de colle : tube de colle blanche couché sur la dalle, bouchon orange, et une traînée
  // gluante derrière lui — c'est elle qui dit qu'il vient de se déplacer.
  if (p.type === 'glue') {
    doodleRR(ctx, x, y, w, h, 6, p.glued ? '#cfc9ba' : '#e8e2d2');
    ctx.fillStyle = '#b8b09a'; ctx.fillRect(x, y + h - 4, w, 4);
    // ⚠ Les gouttes ne pendent QUE tant que le pot poursuit : une traînée gluante sous une dalle
    // qui ne bouge plus aurait promis une poursuite qui n'aura pas lieu.
    if (!p.glued) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 3; i++) { const dx = x + 8 + i * 18, dl = 3 + Math.sin(t * 0.1 + i * 2) * 2; ctx.fillRect(dx, y + h - 3, 3, 3 + dl); }
    }
    doodleRR(ctx, x + w / 2 - 13, y + 2, 26, h - 7, 3, '#f8f4ea');       // le tube
    ctx.fillStyle = '#e8913a';
    ctx.fillRect(x + w / 2 + 11, y + 4, 5, h - 11);                       // le bouchon
    ctx.fillStyle = '#c9c1ae';
    ctx.fillRect(x + w / 2 - 9, y + 4, 12, 2);                            // l'étiquette
    // Vidé : le tube est barré d'un creux et la dalle prend le voile des tuiles épuisées.
    if (p.glued) {
      ctx.strokeStyle = '#a89f8c'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x + w / 2 - 8, y + h / 2 - 1); ctx.lineTo(x + w / 2 + 6, y + h / 2 + 1); ctx.stroke();
      doodleTileSpent(ctx, p);
    }
    return;
  }
  // 🦎 Caméléon : il se dessine comme la tuile copiée, et RIEN d'autre ne le trahit. ⚠ Une
  // COPIE de la dalle, jamais la dalle elle-même : lui écrire `type` dessus, c'était lui donner
  // pour de bon les effets qu'elle est censée seulement mimer.
  if (p.type === 'chameleon' && p.cham) return doodlePlatform(ctx, Object.assign({}, p, { type: p.cham }), t);
  // ⚠ Filet : un caméléon arrivé ici sans déguisement (imité par une 🪞 Mimétique, par exemple)
  // se dessine en dalle verte ordinaire — sans quoi il tomberait sur le repli de fin de table
  // et s'afficherait en 🧨 Bombe, c'est-à-dire en promesse d'explosion qui ne viendrait jamais.
  if (p.type === 'chameleon') return doodlePlatform(ctx, Object.assign({}, p, { type: 'green' }), t);
  // 🪞 Mimétique : avec un modèle, elle se dessine comme lui — via `doodlePlatform` et non
  // `doodleTileDraw`, pour pouvoir copier aussi une verte, une bleue ou une tuile de biome.
  // ⚠ Récursion bornée : `p.mim` ne vaut jamais 'mimic' (voir la recopie dans la boucle).
  if (p.type === 'mimic' && p.mim && p.mim !== 'mimic') return doodlePlatform(ctx, Object.assign({}, p, { type: p.mim }), t);
  // Sans modèle (aucune dalle touchée encore) : miroir vierge, qui montre qu'elle attend.
  if (p.type === 'mimic') {
    doodleRR(ctx, x, y, w, h, 6, '#c8ccd8');
    ctx.fillStyle = '#8f95a8'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.save(); ctx.beginPath(); ctx.rect(x + 4, y + 2, w - 8, h - 7); ctx.clip();
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#f2f5fa'); g.addColorStop(0.5, '#dfe4ee'); g.addColorStop(1, '#f2f5fa');
    ctx.fillStyle = g; ctx.fillRect(x + 4, y + 2, w - 8, h - 7);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;    // le reflet qui balaie la glace
    const sx = x + ((t * 0.8) % (w + 20)) - 10;
    ctx.beginPath(); ctx.moveTo(sx - 6, y + h - 2); ctx.lineTo(sx + 6, y + 1); ctx.stroke();
    ctx.restore();
    return;
  }
  // 📈 Multiplicateur : courbe ascendante sur fond doré.
  if (p.type === 'boost') {
    doodleRR(ctx, x, y, w, h, 6, '#e0a13a');
    ctx.fillStyle = '#9c6b12'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 12, y + h - 5); ctx.lineTo(x + w / 2 - 3, y + h / 2); ctx.lineTo(x + w / 2 + 5, y + h / 2 + 3); ctx.lineTo(x + w - 13, y + 4);
    ctx.stroke();
    ctx.fillStyle = '#3a2a10';
    ctx.beginPath(); ctx.moveTo(x + w - 13, y + 3); ctx.lineTo(x + w - 20, y + 5); ctx.lineTo(x + w - 15, y + 10); ctx.closePath(); ctx.fill();
    // Les passages restants, en pastilles. ⚠ `null` = jamais touchée, donc les trois sont
    // pleines : c'est l'état de très loin le plus fréquent, et lire `p.boostLeft || 0` aurait
    // affiché une dalle neuve comme déjà épuisée.
    const left = p.boostLeft == null ? D_BOOST_USES : p.boostLeft;
    for (let i = 0; i < D_BOOST_USES; i++) {
      const px = x + 6 + i * 5.5, py = y + h - 3.5;
      ctx.fillStyle = i < left ? '#ffe9a8' : 'rgba(58,42,16,0.55)';
      ctx.beginPath(); ctx.arc(px, py, 1.9, 0, Math.PI * 2); ctx.fill();
    }
    if (left <= 0) doodleTileSpent(ctx, p);
    return;
  }
  // 👥 Clones : quatre silhouettes empilées, chacune de la couleur d'un clone.
  if (p.type === 'clone') {
    doodleRR(ctx, x, y, w, h, 6, '#2f5e18');
    ctx.fillStyle = '#1c3a0e'; ctx.fillRect(x, y + h - 4, w, 4);
    D_CLONE_PAL.forEach((c, i) => {
      const cx2 = x + 13 + i * (w - 26) / 3, off = Math.sin(t * 0.12 + i * 1.4) * 1.6;
      ctx.fillStyle = c.body; ctx.strokeStyle = c.dark; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(cx2, y + h / 2 + off, 4.4, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx2, y + h / 2 - 1 + off, 1.5, 0, Math.PI * 2); ctx.fill();
    });
    return;
  }
  // 🎲 Roulette russe : dalle sombre marquée d'un dé. ⚠ 'rrfake' partage ce dessin AU PIXEL
  // PRÈS — le moindre écart (teinte, ombre, animation) désignerait la vraie et viderait la
  // tuile de son sens.
  if (p.type === 'roulette' || p.type === 'rrfake') {
    doodleRR(ctx, x, y, w, h, 6, '#3c3550');
    ctx.fillStyle = '#241f33'; ctx.fillRect(x, y + h - 4, w, 4);
    const cx2 = x + w / 2, cy2 = y + h / 2;
    ctx.fillStyle = '#f0f2f4';
    doodleRR(ctx, cx2 - 6, cy2 - 6, 12, 12, 3, '#f0f2f4');
    ctx.fillStyle = '#2b2b33';
    [[-3, -3], [3, 3], [0, 0]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(cx2 + dx, cy2 + dy, 1.4, 0, Math.PI * 2); ctx.fill(); });
    return;
  }
  // 🎯 Cible : anneaux concentriques, le mille bien marqué. Il faut voir où viser de loin.
  if (p.type === 'target') {
    doodleRR(ctx, x, y, w, h, 6, '#f0f2f4');
    ctx.fillStyle = '#c3ccd4'; ctx.fillRect(x, y + h - 4, w, 4);
    const cx2 = x + w / 2, cy2 = y + h / 2;
    [[D_TARGET_TOL * 2.6, '#e2564a'], [D_TARGET_TOL * 1.7, '#f0f2f4'], [D_TARGET_TOL, '#e2564a']].forEach(([r, c]) => {
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx2, cy2, r, Math.min(r, h / 2 - 1), 0, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = '#2b2b33'; ctx.beginPath(); ctx.arc(cx2, cy2, 2.2, 0, Math.PI * 2); ctx.fill();
    return;
  }
  // 🎈 Ballon : dalle claire d'où dépasse un ballon rouge qui se dandine.
  if (p.type === 'balloon') {
    doodleRR(ctx, x, y, w, h, 6, '#e8dcc8');
    ctx.fillStyle = '#bda98a'; ctx.fillRect(x, y + h - 4, w, 4);
    const bx = x + w / 2 + Math.sin(t * 0.07) * 3;
    ctx.strokeStyle = '#8a2a2a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x + w / 2, y + h - 5); ctx.lineTo(bx, y + 4); ctx.stroke();
    ctx.fillStyle = '#e2564a'; ctx.strokeStyle = '#8a2a2a'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(bx, y + 1, 5, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(bx - 1.6, y - 1, 1.4, 2, -0.4, 0, Math.PI * 2); ctx.fill();
    return;
  }
  // ⏸️ Pause : deux barres, aux couleurs de ce qu'elle vient de faire (bleu = figé, rouge =
  // déchaîné) ou neutres tant qu'on n'y a pas touché.
  if (p.type === 'freeze') {
    const st = p.froze;
    doodleRR(ctx, x, y, w, h, 6, st == null ? '#5b6470' : st === D_FREEZE_SLOW ? '#3f6fd8' : '#c0392b');
    ctx.fillStyle = st == null ? '#3c434c' : st === D_FREEZE_SLOW ? '#2b4a96' : '#7a1f18'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillStyle = '#f2f4f7';
    [-3.5, 2].forEach(dx => ctx.fillRect(x + w / 2 + dx, y + 3.5, 3, h - 9));
    return;
  }
  // 🎰 Machine à sous : bandeau rouge, trois fenêtres et un levier. Éteinte une fois jouée.
  if (p.type === 'slot') {
    doodleRR(ctx, x, y, w, h, 6, '#c0392b');
    ctx.fillStyle = '#7a1f18'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillStyle = '#f5e6c8';
    [0, 1, 2].forEach(i => ctx.fillRect(x + 9 + i * 12, y + 3.5, 9, h - 9));
    ctx.fillStyle = '#7a1f18'; ctx.font = '6px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [0, 1, 2].forEach(i => ctx.fillText('7', x + 13.5 + i * 12, y + h / 2));
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.strokeStyle = '#f5e6c8'; ctx.lineWidth = 2; ctx.lineCap = 'round';   // levier
    ctx.beginPath(); ctx.moveTo(x + w - 5, y + h - 5); ctx.lineTo(x + w - 5, y + 4); ctx.stroke();
    ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(x + w - 5, y + 3, 2.4, 0, Math.PI * 2); ctx.fill();
    if (p.used) doodleTileSpent(ctx, p);
    return;
  }
  // 🔃 Inversion : deux flèches qui s'échangent, et qui tournent tant que la dalle est neuve.
  if (p.type === 'invert') {
    doodleRR(ctx, x, y, w, h, 6, '#7b4bd0');
    ctx.fillStyle = '#42246f'; ctx.fillRect(x, y + h - 4, w, 4);
    const cx2 = x + w / 2, cy2 = y + h / 2;
    ctx.save(); ctx.translate(cx2, cy2); ctx.rotate(t * 0.05);
    ctx.strokeStyle = '#e8dcff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    [1, -1].forEach(sg => {
      ctx.beginPath(); ctx.arc(0, 0, 5.4, sg > 0 ? -0.4 : Math.PI - 0.4, sg > 0 ? Math.PI - 1 : Math.PI * 2 - 1); ctx.stroke();
      const a = sg > 0 ? Math.PI - 1 : -1;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 5.4, Math.sin(a) * 5.4);
      ctx.lineTo(Math.cos(a) * 5.4 - sg * 3.4, Math.sin(a) * 5.4 - 2.6);
      ctx.moveTo(Math.cos(a) * 5.4, Math.sin(a) * 5.4);
      ctx.lineTo(Math.cos(a) * 5.4 - sg * 0.6, Math.sin(a) * 5.4 + 3.6); ctx.stroke();
    });
    ctx.restore();
    return;
  }
  // 🦘 Rebond : dalle vert vif marquée de trois chevrons ascendants — un par saut promis.
  if (p.type === 'rebound') {
    doodleRR(ctx, x, y, w, h, 6, '#3fbf6a');
    ctx.fillStyle = '#1f7a41'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.strokeStyle = '#eafff1'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const yy = y + h - 4.5 - i * 3.4, a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.12 - i * 0.7));
      ctx.save(); ctx.globalAlpha = a;
      ctx.beginPath(); ctx.moveTo(x + w / 2 - 8, yy); ctx.lineTo(x + w / 2, yy - 3.4); ctx.lineTo(x + w / 2 + 8, yy); ctx.stroke();
      ctx.restore();
    }
    return;
  }
  // 🛗 Ascenseur : dalle métallique avec ses deux flèches et un câble qui la tient.
  if (p.type === 'lift') {
    ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1.4;   // câble
    ctx.beginPath(); ctx.moveTo(x + w / 2, y - 60); ctx.lineTo(x + w / 2, y); ctx.stroke();
    doodleRR(ctx, x, y, w, h, 6, '#9aa3ad');
    ctx.fillStyle = '#5f666f'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillStyle = '#2b2b33';
    const cy2 = y + h / 2, up = (p.vy2 || 0) < 0;
    [[-11, -1], [11, 1]].forEach(([dx, sgn]) => {
      ctx.beginPath();
      ctx.moveTo(x + w / 2 + dx, cy2 - sgn * 4); ctx.lineTo(x + w / 2 + dx - 4, cy2 + sgn * 2); ctx.lineTo(x + w / 2 + dx + 4, cy2 + sgn * 2);
      ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = up ? '#63c45a' : '#e2a04a';   // pastille : le sens en cours
    ctx.beginPath(); ctx.arc(x + w / 2, cy2, 3, 0, Math.PI * 2); ctx.fill();
    return;
  }
  // 🦑 Tentacule : dalle sombre à ventouses. Quand il surgit, le tentacule ondule au-dessus —
  // vert s'il propulse, rouge s'il frappe. C'est APRÈS coup : la dalle ne prévient pas, c'est
  // tout son propos.
  // 🦑 Tentacule : dalle-antre percée d'une gueule, d'où le bras JAILLIT dans la direction
  // qu'il vient de donner au doodler, puis se rétracte. ⚠ Le bras est tracé segment par
  // segment avec une épaisseur DÉCROISSANTE : un trait d'épaisseur constante ne se lisait pas
  // comme un membre, seulement comme un câble.
  if (p.type === 'tentacle') {
    doodleRR(ctx, x, y, w, h, 6, '#4a2b52');
    ctx.fillStyle = '#2b1730'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillStyle = '#8a5a95';
    [0.18, 0.82].forEach(f => { ctx.beginPath(); ctx.arc(x + w * f, y + h / 2, 2.6, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#1a0e1f';                                                    // la gueule d'où sort le bras
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + 4.5, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    if (p.tent > 0) {
      const k = 1 - p.tent / D_TENT_LIFE;
      const ext = Math.sin(Math.min(1, k * 1.35) * Math.PI);                      // sort vite, rentre doucement
      const L = 62 * ext, ang = p.tentAng == null ? -Math.PI / 2 : p.tentAng;
      const bx = x + w / 2, by = y + 3, segs = 10;
      const nx = Math.cos(ang + Math.PI / 2), ny2 = Math.sin(ang + Math.PI / 2);
      const pts = [];
      for (let i = 0; i <= segs; i++) {
        const f = i / segs, wob = Math.sin(t * 0.28 - f * 3.4) * 7 * f * ext;
        pts.push([bx + Math.cos(ang) * L * f + nx * wob, by + Math.sin(ang) * L * f + ny2 * wob]);
      }
      ctx.save(); ctx.lineCap = 'round';
      [['#2b1730', 1.4], ['#a05ab0', 1]].forEach(([col, mul]) => {
        ctx.strokeStyle = col;
        for (let i = 0; i < segs; i++) {
          ctx.lineWidth = (9 - i * 0.72) * mul;
          ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
        }
      });
      ctx.fillStyle = '#f0c8f8';                                                  // ventouses, alignées d'un seul côté
      for (let i = 1; i < segs; i += 2) {
        const r = (7 - i * 0.5) * 0.42;
        ctx.beginPath(); ctx.arc(pts[i][0] + nx * r * 1.6, pts[i][1] + ny2 * r * 1.6, Math.max(1, r), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    return;
  }
  // 🪃 Boomerang : dalle de bois clair marquée d'un V, qui tourne sur elle-même en vol.
  // ⚠ La boîte de collision, elle, ne tourne pas : elle reste le rectangle habituel, et la
  // dalle demeure praticable en plein arc — c'est une plateforme mobile de plus, pas un piège.
  if (p.type === 'boomer') {
    ctx.save();
    if (p.boo) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate(p.boo.t * 0.22); ctx.translate(-(x + w / 2), -(y + h / 2)); }
    doodleRR(ctx, x, y, w, h, 6, '#d8a24a');
    ctx.fillStyle = '#9c6b22'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.strokeStyle = '#5b3a1c'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x + w / 2 - 9, y + 3.5); ctx.lineTo(x + w / 2, y + h - 4.5); ctx.lineTo(x + w / 2 + 9, y + 3.5); ctx.stroke();
    ctx.restore();
    return;
  }
  // 🎁 Coffre : dalle de bois cerclée d'or, marquée d'un coffre. Éteinte une fois donnée.
  if (p.type === 'chest') {
    doodleRR(ctx, x, y, w, h, 6, '#8a5a2c');
    ctx.fillStyle = '#5b3a1c'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillStyle = '#b9793a'; ctx.fillRect(x + 4, y + 2.5, w - 8, h * 0.36);
    ctx.fillStyle = '#ffd54a'; ctx.fillRect(x + w / 2 - 3, y + h * 0.3, 6, 6);
    ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 1.3;
    if (!p.used) { ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(t * 0.15) * 0.5; doodleRR(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 5, 'rgba(0,0,0,0)'); ctx.stroke(); ctx.restore(); }
    if (p.used) doodleTileSpent(ctx, p);
    return;
  }
  // 🃏 Casino : dos de carte tant qu'on n'y a pas touché, puis la dalle qu'il imite — c'est
  // ainsi que l'effacement du fantôme, la mèche de la bombe ou les piques restent visibles.
  // ⚠ La récursion est bornée : `p.roll` ne vaut jamais 'casino' (exclu du tirage).
  if (p.type === 'casino') {
    if (p.shown && p.roll) return doodleTileDraw(ctx, { ...p, type: p.roll }, t);
    doodleRR(ctx, x, y, w, h, 6, '#2f2a4a');
    ctx.fillStyle = '#1b1830'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 1.4;
    doodleRR(ctx, x + 3, y + 2.5, w - 6, h - 7, 4, 'rgba(0,0,0,0)'); ctx.stroke();
    ctx.save(); ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd54a'; ctx.globalAlpha = 0.65 + Math.sin(t * 0.13) * 0.35;
    ctx.fillText('?', x + w / 2, y + h / 2);
    ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    return;
  }
  // 👻 Fantôme : dalle bleutée à l'ourlet ondulé, qui pâlit jusqu'à disparaître. L'opacité EST
  // le compte à rebours — c'est le seul avertissement avant qu'elle ne cesse de porter.
  if (p.type === 'ghost') {
    ctx.save();
    ctx.globalAlpha = p.fade > 0 ? Math.max(0.1, p.fade / D_GHOST_LIFE) : 0.95;
    doodleRR(ctx, x, y, w, h - 3, 6, '#e2e6ff');
    ctx.fillStyle = '#e2e6ff';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + 8 + i * (w - 16) / 3, y + h - 3, (w - 16) / 6, 0, Math.PI); ctx.fill(); }
    ctx.fillStyle = '#3a3a55';
    [-7, 7].forEach(dx => { ctx.beginPath(); ctx.ellipse(x + w / 2 + dx, y + h / 2 - 1, 2, 2.8, 0, 0, Math.PI * 2); ctx.fill(); });
    ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2 + 3, 2.4, 0, Math.PI); ctx.fill();
    ctx.restore();
    return;
  }
  // 🪗 Accordéon : soufflet dont les plis se resserrent à mesure de la compression. Le corps
  // dessiné RÉTRÉCIT par le haut alors que la boîte de collision, elle, ne bouge pas — mais le
  // doodler est retenu pendant toute la compression, donc rien ne peut retomber dans l'écart.
  if (p.type === 'accord') {
    const sq = p.squash || 0, hh = h * (1 - 0.38 * sq), yy = y + (h - hh);
    doodleRR(ctx, x, yy, w, hh, 5, '#c0392b');
    ctx.fillStyle = '#7a1f18'; ctx.fillRect(x, yy + hh - 4, w, 4);
    ctx.fillStyle = '#2b2b33'; ctx.fillRect(x + 2, yy + 2, 6, hh - 4); ctx.fillRect(x + w - 8, yy + 2, 6, hh - 4);
    ctx.strokeStyle = '#f5e6c8'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    const n = 6, x0 = x + 10, span = w - 20;
    for (let i = 0; i <= n; i++) { const bx = x0 + i * span / n * (1 - 0.25 * sq) + span * 0.125 * sq; ctx.moveTo(bx, yy + 2.5); ctx.lineTo(bx, yy + hh - 3.5); }
    ctx.stroke();
    return;
  }
  // 👹 Générateur : portail violet dont l'anneau tourne et d'où deux yeux guettent. Éteint,
  // il se voile — la dalle reste franchissable mais ne rappellera plus personne.
  if (p.type === 'spawner') {
    doodleRR(ctx, x, y, w, h, 6, '#5a3d7a');
    ctx.fillStyle = '#33224a'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.strokeStyle = '#c9a8ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 5.5, t * 0.06, t * 0.06 + Math.PI * 1.4); ctx.stroke();
    ctx.fillStyle = p.used ? '#7a6a8a' : '#ffd54a';
    [-3.2, 3.2].forEach(dx => { ctx.beginPath(); ctx.arc(x + w / 2 + dx, y + h / 2, 1.6, 0, Math.PI * 2); ctx.fill(); });
    if (p.used) doodleTileSpent(ctx, p);
    return;
  }
  // ⚙️ Piège à picots : la dalle est sûre, sauf quand les piques sont sorties. Un liseré
  // s'allume juste AVANT la sortie — sans cette annonce, le piège serait injouable.
  if (p.type === 'picots') {
    const on = doodleCycleOn(p, t), prox = ((t + (p.ph || 0)) % D_PICOT_CYCLE) > D_PICOT_CYCLE - D_PICOT_TELL;
    doodleRR(ctx, x, y, w, h, 6, on ? '#8e2b2b' : '#8b8f98');
    ctx.fillStyle = on ? '#5c1a1a' : '#5f636b'; ctx.fillRect(x, y + h - 4, w, 4);
    if (prox && !on) { ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 2; doodleRR(ctx, x + 1, y + 1, w - 2, h - 2, 5, 'rgba(0,0,0,0)'); ctx.stroke(); }
    if (on) { ctx.fillStyle = '#f2f4f7'; for (let i = 0; i < 5; i++) { const px = x + 8 + i * (w - 16) / 4; ctx.beginPath(); ctx.moveTo(px - 4, y); ctx.lineTo(px, y - 10); ctx.lineTo(px + 4, y); ctx.closePath(); ctx.fill(); } }
    else { ctx.fillStyle = '#5f636b'; for (let i = 0; i < 5; i++) { const px = x + 8 + i * (w - 16) / 4; ctx.beginPath(); ctx.arc(px, y + 3, 1.6, 0, Math.PI * 2); ctx.fill(); } }
    return;
  }
  // ➡️ Tapis roulant : chevrons qui DÉFILENT dans le sens de l'entraînement — la direction se
  // lit avant même d'avoir posé le pied.
  if (p.type === 'belt') {
    doodleRR(ctx, x, y, w, h, 6, '#4a4f59');
    ctx.save(); doodleRR(ctx, x, y, w, h, 6, '#4a4f59'); ctx.clip();
    ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 2.4;
    const off = ((t * 1.6 * (p.dir || 1)) % 14 + 14) % 14;
    for (let i = -1; i < w / 14 + 1; i++) {
      const bx = x + i * 14 + off;
      ctx.beginPath(); ctx.moveTo(bx, y + 3); ctx.lineTo(bx + 5 * (p.dir || 1), y + h / 2); ctx.lineTo(bx, y + h - 3); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#2f333b'; ctx.fillRect(x, y + h - 3, w, 3);
    return;
  }
  // ⚡ Électrifiée : arc visible pendant la décharge, bornes ternes le reste du temps.
  if (p.type === 'zap') {
    const on = doodleCycleOn(p, t);
    doodleRR(ctx, x, y, w, h, 6, on ? '#3f6fd8' : '#6b7280');
    ctx.fillStyle = on ? '#2b4a96' : '#4b5058'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillStyle = '#c9ced6';
    [x + 7, x + w - 7].forEach(bx => { ctx.beginPath(); ctx.arc(bx, y + h / 2, 3, 0, Math.PI * 2); ctx.fill(); });
    if (on) {
      ctx.strokeStyle = '#ffe98a'; ctx.lineWidth = 2.2; ctx.beginPath();
      ctx.moveTo(x + 7, y + h / 2);
      for (let i = 1; i < 6; i++) ctx.lineTo(x + 7 + i * (w - 14) / 6, y + h / 2 + (i % 2 ? -6 : 6));
      ctx.lineTo(x + w - 7, y + h / 2); ctx.stroke();
    }
    return;
  }
  // 🧲 Aimantée : fer à cheval rouge et blanc, plus des ondes quand elle vient de servir.
  if (p.type === 'magnet') {
    doodleRR(ctx, x, y, w, h, 6, '#c94a4a');
    ctx.fillStyle = '#8e2b2b'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.strokeStyle = '#f2f4f7'; ctx.lineWidth = 3; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(x + w / 2, y + h - 2, 7, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.4;
    for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.arc(x + w / 2, y + h - 2, 7 + i * 5 + (t % 30) / 6, Math.PI, 0); ctx.stroke(); }
    return;
  }
  // ⏱️ Ralentisseur : cadran dont l'aiguille tourne… lentement.
  if (p.type === 'slow') {
    doodleRR(ctx, x, y, w, h, 6, '#3fa9c8');
    ctx.fillStyle = '#276b81'; ctx.fillRect(x, y + h - 4, w, 4);
    const cx2 = x + w / 2, cy2 = y + h / 2;
    ctx.fillStyle = '#eaf7fb'; ctx.strokeStyle = '#1c4e5e'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx2, cy2, 5.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const a = t * 0.012;
    ctx.strokeStyle = '#1c4e5e'; ctx.lineWidth = 1.6; ctx.beginPath();
    ctx.moveTo(cx2, cy2); ctx.lineTo(cx2 + Math.cos(a - Math.PI / 2) * 3.6, cy2 + Math.sin(a - Math.PI / 2) * 3.6); ctx.stroke();
    return;
  }
  if (p.type === 'meteor') {
    doodleRR(ctx, x, y, w, h, 6, '#6b5563');
    ctx.fillStyle = '#3f3038'; ctx.fillRect(x, y + h - 4, w, 4);
    // Cratères : la dalle dit d'elle-même qu'elle a déjà reçu ce qu'elle appelle.
    ctx.fillStyle = '#8b7280';
    [[0.24, 0.36], [0.52, 0.6], [0.76, 0.34]].forEach(([fx, fy]) => { ctx.beginPath(); ctx.arc(x + w * fx, y + h * fy, 2.1, 0, Math.PI * 2); ctx.fill(); });
    ctx.save(); ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('☄️', x + w / 2, y + h / 2); ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    return;
  }
  // 🌵 10.8.1 — LA PIQUE EST UN CACTUS (demande utilisateur, biome Désert) : un bac de terre
  // sèche d'où sortent trois raquettes vertes cannelées. ⚠ Les ÉPINES ne se dessinent QUE
  // dalle armée — comme les anciennes piques, c'est le seul indice qu'elle est devenue
  // mortelle. Un cactus déjà hérissé au 1er rebond aurait menti sur le danger réel.
  if (D_SPIKY.has(p.type)) {
    const cx = x + w / 2, arm = !!p.armed;
    doodleRR(ctx, x, y, w, h, 6, arm ? '#8a6a34' : '#a98a52');                  // le bac de terre
    ctx.fillStyle = '#5e4520'; ctx.fillRect(x + 3, y + h - 4, w - 6, 3);
    const green = arm ? '#2f7a24' : '#4e9c33', dark = arm ? '#1c5417' : '#2f7a24';
    // Trois raquettes : une haute au centre, deux bras plus courts. ⚠ Elles DÉBORDENT vers le
    // haut, hors de la boîte de la dalle : la dalle fait 14 px, un cactus tenu dedans n'aurait
    // été qu'un trait vert de plus.
    const pad = (px, py, pw, ph) => {
      ctx.fillStyle = green; ctx.strokeStyle = '#173f12'; ctx.lineWidth = 1.4;
      doodleRR(ctx, px - pw / 2, py, pw, ph, pw / 2, green);
      ctx.strokeStyle = dark; ctx.lineWidth = 1;                                 // les cannelures
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(px + i * pw * 0.26, py + 2); ctx.lineTo(px + i * pw * 0.26, py + ph - 2); ctx.stroke(); }
    };
    const pads = [[cx - 15, y - 9, 9, 13], [cx + 15, y - 13, 9, 17], [cx, y - 20, 13, 26]];
    pads.forEach(q => pad(q[0], q[1], q[2], q[3]));
    if (arm) {
      // Les ÉPINES sortent des FLANCS de chaque raquette, par paires opposées, plus une
      // couronne au sommet : c'est la silhouette hérissée qu'on doit reconnaître d'un coup
      // d'œil, pas quelques traits posés sur le bac.
      ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      pads.forEach(([px, py, pw, ph]) => {
        const n = Math.max(2, Math.round(ph / 6));
        for (let i = 0; i < n; i++) {
          const yy = py + 4 + i * (ph - 7) / Math.max(1, n - 1);
          [-1, 1].forEach(sx => { ctx.beginPath(); ctx.moveTo(px + sx * pw * 0.42, yy); ctx.lineTo(px + sx * (pw * 0.42 + 4.5), yy - 2.4); ctx.stroke(); });
        }
        [-0.5, 0, 0.5].forEach(f => { ctx.beginPath(); ctx.moveTo(px + f * pw * 0.7, py + 1.5); ctx.lineTo(px + f * pw * 1.1, py - 3.6); ctx.stroke(); });
      });
      // Une fleur rouge au sommet : le cactus armé se distingue même de loin.
      ctx.fillStyle = '#e2564a'; ctx.strokeStyle = '#7a1f18'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, y - 24, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(cx, y - 24, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }
  // 🌋 10.10.1 — LE GEYSER A SON PROPRE DESSIN (demande utilisateur) : la plaque de biome
  // générique marquée d'un émoji ne ressemblait à rien. C'est maintenant un CÔNE DE SINTRE —
  // le dépôt minéral pâle en terrasses que creuse une source chaude — percé d'un évent sombre
  // où l'eau bout, d'où part le jet.
  // ⚠ Le cône DÉBORDE de la boîte de la dalle vers le haut et sur les côtés : contenu dans
  // 68 × 14 px, il redevenait une barre plate indiscernable d'une plateforme ordinaire.
  // ⚠ Deux états francs : AU REPOS l'évent bouillonne et trois volutes lentes s'en échappent —
  // la dalle doit se reconnaître même froide ; ARMÉE (`p.steam`), une colonne d'eau et de
  // vapeur jaillit, et elle retombe toute seule.
  if (p.type === 'geyser') {
    const hot = Math.max(0, Math.min(1, (p.steam || 0) / D_STEAM_LIFE));
    // Trois terrasses étagées, de la plus large et sombre (à la base) à la plus étroite et
    // pâle (la lèvre). ⚠ Chacune est un MUR plein descendant jusqu'à l'assise, coiffé d'une
    // ellipse plus claire : dessinées en simples ellipses empilées, elles se chevauchaient et
    // le cône redevenait une bosse plate.
    const cx = x + w / 2;
    const tiers = [
      { rx: w * 0.50, ry: 6.0, top: y + h - 3,  col: '#7d564d', cap: '#9d7264' },
      { rx: w * 0.37, ry: 5.0, top: y + h - 11, col: '#b98b7c', cap: '#d3a998' },
      { rx: w * 0.25, ry: 4.0, top: y + h - 18, col: '#e0c3b6', cap: '#f6e6de' },
    ];
    const lip = tiers[2].top;                               // `lip` = la lèvre de l'évent
    ctx.save();
    // ── le jet, DERRIÈRE le cône : il sort du trou, il ne flotte pas devant ──
    if (hot > 0) {
      const hgt = 30 + hot * 92, wid = 5 + hot * 7;
      const g = ctx.createLinearGradient(0, lip - hgt, 0, lip);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.45, `rgba(226,244,250,${0.55 * hot})`); g.addColorStop(1, `rgba(180,224,238,${0.85 * hot})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - wid * 0.6, lip);
      ctx.quadraticCurveTo(cx - wid * 1.6, lip - hgt * 0.6, cx - wid * 0.4, lip - hgt);
      ctx.lineTo(cx + wid * 0.4, lip - hgt);
      ctx.quadraticCurveTo(cx + wid * 1.6, lip - hgt * 0.6, cx + wid * 0.6, lip);
      ctx.closePath(); ctx.fill();
      // gouttes projetées le long de la colonne
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 7; i++) {
        const ph = ((t * 0.09 + i / 7) % 1);
        const dy = lip - ph * hgt, dx = Math.sin(ph * 6 + i) * (wid * 1.5 + ph * 10);
        ctx.globalAlpha = (1 - ph) * hot;
        ctx.beginPath(); ctx.arc(cx + dx, dy, 1.4 + (1 - ph) * 1.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // ── le panache de vapeur, qui monte plus haut et plus large que le jet ──
    const nv = hot > 0 ? 9 : 3;
    for (let i = 0; i < nv; i++) {
      const ph = (t * (0.012 + hot * 0.02) + i / nv) % 1;
      ctx.globalAlpha = (1 - ph) * (0.18 + hot * 0.5);
      ctx.fillStyle = i % 2 ? '#ffffff' : '#e8d8d4';
      ctx.beginPath();
      ctx.arc(cx + Math.sin(ph * 5 + i) * (5 + hot * 9), lip - 6 - ph * (26 + hot * 70), 3 + ph * (6 + hot * 9), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // ── le cône de sintre, du bas vers le haut ──
    for (const ti of tiers) {
      ctx.fillStyle = ti.col;
      ctx.fillRect(cx - ti.rx, ti.top, ti.rx * 2, y + h - ti.top);        // le mur de la terrasse
      ctx.fillStyle = ti.cap;                                             // et sa margelle, plus claire
      ctx.beginPath(); ctx.ellipse(cx, ti.top, ti.rx, ti.ry, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#5f3f38'; ctx.fillRect(x + 2, y + h - 3, w - 4, 3);   // l'assise, qui porte
    // Ruissellement : deux filets pâles qui dévalent la terrasse du bas — le dépôt minéral
    // vient de là, et sans eux le cône se lit comme un simple tas de terre.
    ctx.strokeStyle = 'rgba(246,230,222,0.55)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    [-1, 1].forEach(sx => {
      ctx.beginPath();
      ctx.moveTo(cx + sx * 9, lip + 3);
      ctx.quadraticCurveTo(cx + sx * (w * 0.30), y + h - 8, cx + sx * (w * 0.44), y + h - 3);
      ctx.stroke();
    });
    // ── l'évent : trou sombre, eau qui bout dedans, lèvre humide ──
    ctx.fillStyle = '#3d221c';
    ctx.beginPath(); ctx.ellipse(cx, lip, 8.5, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hot > 0 ? '#dff4fb' : '#5aa8c2';
    const bo = 1 + Math.sin(t * (hot > 0 ? 0.4 : 0.12)) * 0.6;
    ctx.beginPath(); ctx.ellipse(cx, lip + 0.5, 6.2, 2.0 + bo * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    if (hot <= 0) {                                          // les bulles du repos
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 3; i++) {
        const ph = ((t * 0.04 + i / 3) % 1);
        ctx.globalAlpha = 1 - ph;
        ctx.beginPath(); ctx.arc(cx - 4 + i * 4, lip + 1 - ph * 4, 1.1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(cx, lip, 8.5, 3.4, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.restore();
    return;
  }
  // 🔥 Magma : une croûte de roche noire craquelée d'où la lave affleure, et un bourrelet en
  // fusion qui déborde à la sous-face — c'est de là que partent les gouttes. ⚠ Les fissures
  // PULSENT : une coulée figée se serait lue comme une simple dalle sombre.
  if (p.type === 'magma') {
    const glow = 0.55 + Math.sin(t * 0.06) * 0.35;
    doodleRR(ctx, x, y, w, h, 5, '#2e1a16');
    ctx.save();
    ctx.fillStyle = `rgba(255,140,58,${0.35 + glow * 0.35})`;            // la lave sous la croûte
    for (let i = 0; i < 4; i++) {
      const fx = x + 7 + i * (w - 14) / 3, fw = 5 + ((i * 7) % 5);
      ctx.beginPath();
      ctx.moveTo(fx, y + 2); ctx.lineTo(fx + fw, y + h * 0.42); ctx.lineTo(fx + fw * 0.4, y + h - 4);
      ctx.lineTo(fx - 2.5, y + h * 0.5); ctx.closePath(); ctx.fill();
    }
    // Le bourrelet incandescent qui pend sous la dalle, et une goutte prête à tomber.
    const g = ctx.createLinearGradient(0, y + h - 4, 0, y + h + 6);
    g.addColorStop(0, '#ffd54a'); g.addColorStop(0.5, '#ff8c3a'); g.addColorStop(1, '#c4553a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x + 2, y + h - 4);
    for (let i = 0; i <= 4; i++) ctx.quadraticCurveTo(x + 2 + (i + 0.5) * (w - 4) / 5, y + h + (i % 2 ? 6 : 2), x + 2 + (i + 1) * (w - 4) / 5, y + h + 1);
    ctx.lineTo(x + w - 2, y + h - 4); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = glow;                                              // la lueur du foyer
    ctx.fillStyle = 'rgba(255,120,40,0.5)';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h, w * 0.42, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#120a08'; ctx.lineWidth = 1.4;                    // les craquelures de la croûte
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 3); ctx.lineTo(x + 17, y + h - 5); ctx.moveTo(x + 26, y + 2); ctx.lineTo(x + 34, y + h - 3);
    ctx.moveTo(x + 44, y + 4); ctx.lineTo(x + 53, y + h - 6); ctx.stroke();
    return;
  }
  // 🧊 Stalactite : une dalle de glace bleue d'où pendent trois piques — tant qu'elles sont là.
  // Décrochée (`p.stal`), il ne reste que les moignons brisés à sa sous-face : la dalle dit
  // qu'elle a déjà tiré son coup.
  // ⚠ 10.10.5 — Le dessin lit `p.stalLeft` : chaque pique décrochée laisse un MOIGNON à sa
  // place, et les autres continuent de pendre. Une dalle à moitié vidée qui aurait continué
  // d'afficher ses trois piques aurait menti sur ce qu'il reste à en tirer.
  // ⚠ Les piques partent de GAUCHE À DROITE, donc les moignons occupent les premiers indices.
  if (p.type === 'stalac') {
    const left = p.stalLeft == null ? D_STAL_N : p.stalLeft;
    const gone = D_STAL_N - left;                                     // combien sont déjà tombées
    for (let i = gone; i < D_STAL_N; i++) {                           // celles qui pendent encore
      const cx2 = x + (i + 0.5) * w / D_STAL_N;
      doodleIcicle(ctx, cx2, y + h - 1, D_STAL_W, D_STAL_H + Math.sin(t * 0.06 + i) * 1.2);
    }
    doodleRR(ctx, x, y, w, h, 5, left ? '#cfeaf8' : '#a8c8d8');
    ctx.fillStyle = left ? '#7fc9e0' : '#6f93a6'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6;   // les fêlures de la glace
    ctx.beginPath(); ctx.moveTo(x + 9, y + 9); ctx.lineTo(x + 19, y + 3); ctx.moveTo(x + 32, y + 10); ctx.lineTo(x + 47, y + 3); ctx.stroke();
    // Les balles encaissées fêlent la glace un peu plus à chaque coup : le compteur se voit.
    const fel = (p.stalHits || 0) % D_STAL_SHOTS;
    if (fel && left) {
      ctx.strokeStyle = 'rgba(79,147,181,0.85)'; ctx.lineWidth = 1.1;
      for (let i = 0; i < fel; i++) {
        const fx = x + 14 + i * 12;
        ctx.beginPath(); ctx.moveTo(fx, y + 2); ctx.lineTo(fx + 3, y + h / 2); ctx.lineTo(fx - 2, y + h - 3); ctx.stroke();
      }
    }
    ctx.fillStyle = '#9fd8ee'; ctx.strokeStyle = '#4f93b5'; ctx.lineWidth = 1;   // les moignons brisés
    for (let i = 0; i < gone; i++) {
      const cx2 = x + (i + 0.5) * w / D_STAL_N;
      ctx.beginPath(); ctx.moveTo(cx2 - 4, y + h); ctx.lineTo(cx2 + 4, y + h); ctx.lineTo(cx2 + 1, y + h + 3.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    return;
  }
  // 🌨️ Congère : une dalle sous un manteau de neige bombé, avec des flocons qui tombent
  // dessus. ⚠ La neige DÉBORDE vers le haut, hors de la boîte : c'est elle qui doit se voir de
  // loin, une dalle blanche plate se serait confondue avec la ⬜ blanche du jeu d'origine.
  if (p.type === 'snow') {
    const cx2 = x + w / 2;
    doodleRR(ctx, x, y, w, h, 5, '#8fb8cf');
    ctx.fillStyle = '#5f8ba6'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#cfe4f0'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x, y + 5);
    ctx.quadraticCurveTo(x + w * 0.22, y - 7, cx2, y - 3);
    ctx.quadraticCurveTo(x + w * 0.78, y + 1, x + w, y + 4);
    ctx.lineTo(x + w, y + 8); ctx.lineTo(x, y + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {                                     // les flocons qui tombent
      const fx = x + 9 + i * (w - 18) / 3 + Math.sin(t * 0.05 + i) * 3;
      const fy = y - 20 + ((t * 0.6 + i * 9) % 22);
      for (let a = 0; a < 3; a++) { const an = a * Math.PI / 3; ctx.beginPath(); ctx.moveTo(fx - Math.cos(an) * 2.6, fy - Math.sin(an) * 2.6); ctx.lineTo(fx + Math.cos(an) * 2.6, fy + Math.sin(an) * 2.6); ctx.stroke(); }
    }
    ctx.restore();
    return;
  }
  // 𓂀 Égypte : une stèle de grès à bandeau doré, gravée de trois hiéroglyphes. Ouverte
  // (`p.mum`), la fente centrale reste béante et le grès s'assombrit — la dalle dit qu'elle a
  // déjà donné ses momies.
  if (p.type === 'egypt') {
    const done = !!p.mum, cx = x + w / 2;
    doodleRR(ctx, x, y, w, h, 4, done ? '#a8894f' : '#dcbe7e');
    ctx.fillStyle = done ? '#6f5525' : '#a8894f'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillStyle = '#c9a24a'; ctx.fillRect(x + 2, y + 1.5, w - 4, 2);            // bandeau doré
    ctx.fillRect(x + 2, y + h - 6.5, w - 4, 2);
    ctx.save();
    ctx.strokeStyle = done ? '#4a3714' : '#5e4520'; ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    // ☥ l'ânkh
    let gx = x + 12, gy = y + h / 2;
    ctx.beginPath(); ctx.arc(gx, gy - 3, 2.4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx, gy - 0.6); ctx.lineTo(gx, gy + 5); ctx.moveTo(gx - 3, gy + 1); ctx.lineTo(gx + 3, gy + 1); ctx.stroke();
    // 𓂀 l'œil oudjat
    gx = x + w / 2;
    ctx.beginPath(); ctx.ellipse(gx, gy - 1, 5, 3, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(gx, gy - 1, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(gx + 4, gy + 1.5); ctx.lineTo(gx + 5.5, gy + 5); ctx.moveTo(gx - 1, gy + 2.5); ctx.lineTo(gx - 1.5, gy + 5.5); ctx.stroke();
    // 〰 l'onde d'eau
    gx = x + w - 13;
    ctx.beginPath(); ctx.moveTo(gx - 5, gy - 2);
    for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(gx - 3.5 + i * 2.5, gy - 2 + (i % 2 ? 2.6 : -2.6), gx - 2.5 + i * 2.5, gy - 2);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx - 5, gy + 4);
    for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(gx - 3.5 + i * 2.5, gy + 4 + (i % 2 ? 2.6 : -2.6), gx - 2.5 + i * 2.5, gy + 4);
    ctx.stroke();
    ctx.restore();
    // La fente d'où sortent les momies. Fermée : un joint doré qui palpite, l'annonce qu'il y a
    // quelque chose derrière. Ouverte : une porte étroite en ogive, noire au fond mais bordée
    // d'or, avec la poussière du tombeau qui s'en échappe. ⚠ ÉTROITE et non pleine largeur :
    // un rectangle noir de bout en bout ne se lisait plus comme une ouverture, seulement comme
    // une dalle éteinte.
    if (done) {
      ctx.save();
      ctx.fillStyle = '#120c04';
      ctx.beginPath();
      ctx.moveTo(cx - 6, y + h - 3); ctx.lineTo(cx - 6, y + 4.5);
      ctx.quadraticCurveTo(cx, y - 0.5, cx + 6, y + 4.5); ctx.lineTo(cx + 6, y + h - 3);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.globalAlpha = 0.20 + Math.sin(t * 0.05) * 0.10;                        // la poussière
      ctx.fillStyle = '#e8dcc0';
      for (let i = 0; i < 3; i++) { const dy = ((t * 0.5 + i * 5) % 12); ctx.fillRect(cx - 4 + i * 3.4, y + 3 + dy, 1.6, 1.6); }
      ctx.restore();
    } else {
      ctx.fillStyle = '#8a6a34'; ctx.fillRect(cx - 9, y + h / 2 - 0.8, 18, 1.6);
      ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(t * 0.08) * 0.25;
      ctx.fillStyle = '#ffd54a'; ctx.fillRect(cx - 9, y + h / 2 - 0.8, 18, 1.6); ctx.restore();
    }
    return;
  }
  // 🌬️ Girouette : un nuage BLEU, des filets d'air qui le traversent DANS le sens du vent, et une
  // flèche BLANCHE qui le désigne. ⚠ Le sens est FIXE (`g4`, tiré à la naissance) : une girouette
  // qui aurait tourné n'aurait rien annoncé du tout.
  // ⚠ La flèche est posée sur le bourrelet CENTRAL (y + h * 0,44) et non au milieu de la boîte :
  // c'est là qu'il y a du bleu sous elle, et une flèche blanche sur du vide ne se lit pas.
  if (p.type === 'gale') {
    const d = D_GALE_DIRS[(p.g4 || 0) % D_GALE_DIRS.length], cx = x + w / 2, cy = y + h * 0.44;
    const qx = -d[1], qy = d[0];                                       // la perpendiculaire : l'écartement des filets
    doodleGaleBody(ctx, x, y, w, h, '#5bb0ea', '#2f7fbf');
    ctx.save();
    ctx.globalAlpha = 0.75; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    const span = d[0] ? w : h;
    for (let i = -1; i <= 1; i++) {
      if (!i) continue;                                                // la ligne du milieu est prise par la flèche
      const ph = ((t * 0.9 + (i + 1) * span / 3) % span) - span / 2;
      const bx = cx + d[0] * ph + qx * i * 6, by = cy + d[1] * ph + qy * i * 6;
      ctx.beginPath(); ctx.moveTo(bx - d[0] * 5, by - d[1] * 5); ctx.lineTo(bx + d[0] * 5, by + d[1] * 5); ctx.stroke();
    }
    ctx.restore();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.atan2(d[1], d[0]));
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(28,74,110,0.55)'; ctx.lineWidth = 1; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(11, 0); ctx.lineTo(3, -5.5); ctx.lineTo(3, -2); ctx.lineTo(-11, -2);
    ctx.lineTo(-11, 2); ctx.lineTo(3, 2); ctx.lineTo(3, 5.5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    return;
  }
  // ⛈️ Orage : le même nuage que sa sœur la girouette, mais d'ardoise, et une VRAIE averse sous le
  // ventre. ⚠ 10.11.0 — L'ÉCLAIR PENDU EST RETIRÉ (demande utilisateur, « retire l'icône orage
  // dessus ») et la pluie est TROIS FOIS plus dense pour prendre sa place.
  // ⚠ L'annonce du coup ne disparaît pas pour autant : `near` (indexé sur `stormT`) fait
  // ACCÉLÉRER et BLANCHIR l'averse, et allume une lueur dans le ventre du nuage. Sans elle,
  // la foudre serait devenue une punition au hasard au lieu d'un rythme qu'on peut lire.
  // ⚠ La pluie tombe SOUS la dalle, jamais dessus : au-dessus, elle se serait confondue avec le
  // doodler qui vient s'y poser.
  if (p.type === 'storm') {
    const near = p.stormT == null ? 0 : Math.max(0, 1 - p.stormT / 60);
    doodleCloudBody(ctx, x, y, w, h, '#69727f', '#434b57');
    ctx.save();
    // La lueur qui monte dans le ventre : l'annonce du coup. ⚠ Un dégradé RADIAL et non un
    // aplat — une ellipse pleine se lisait comme un objet posé sous le nuage, soit exactement
    // l'icône qu'on vient d'enlever.
    const glow = ctx.createRadialGradient(x + w / 2, y + h - 2, 0, x + w / 2, y + h - 2, w * 0.34);
    glow.addColorStop(0, 'rgba(255,233,138,' + (0.30 + near * 0.55).toFixed(2) + ')');
    glow.addColorStop(1, 'rgba(255,233,138,0)');
    ctx.fillStyle = glow; ctx.fillRect(x - 4, y + h - 12, w + 8, 20);
    ctx.restore();
    ctx.save();
    // L'averse : une goutte par colonne, régulièrement réparties mais de longueur, de vitesse
    // et de phase toutes différentes — de même taille et en phase, elles auraient fait une
    // grille et non de la pluie.
    // ⚠ Les gouttes FONCENT à l'approche du coup au lieu de blanchir : sur le papier clair du
    // carnet, une pluie presque blanche aurait disparu juste au moment où elle avertit.
    ctx.fillStyle = near > 0.5 ? '#4f7fb8' : '#8fb4d6';
    for (let i = 0; i < D_STORM_DROPS; i++) {
      const sp = 1.1 + doodleRnd(i + 5) * 1.5 + near * 0.9;
      const dl = 3 + doodleRnd(i + 19) * 4;
      const fall = 13 + doodleRnd(i + 41) * 7;
      const rx = x + 4 + (i + 0.5) * (w - 8) / D_STORM_DROPS + (doodleRnd(i + 3) - 0.5) * 3.4;
      const ry = y + h - 1 + ((t * sp + doodleRnd(i + 31) * fall) % fall);
      ctx.globalAlpha = (0.55 + doodleRnd(i + 11) * 0.35) * (1 - (ry - y - h + 1) / fall * 0.5);
      ctx.fillRect(rx, ry, 1.4, dl);
    }
    ctx.restore();
    return;
  }
  // 🌈 Arc-en-ciel : la dalle est une bande de six couleurs, et l'arc s'élève de son dos jusqu'au
  // second pied. ⚠ L'arc est dessiné AVANT la dalle — ses pieds se glissent ainsi SOUS le bois
  // au lieu de le barrer — et il lit la position VIVE de sa partenaire (`arcTo` est une
  // référence) : il suit donc une 🔵 bleue qui se déplace, au lieu de rester tendu vers un point
  // que plus rien n'occupe.
  if (p.type === 'rbow') {
    const q = p.arcTo;
    if (q && !q.dead) {
      // ⚠ 11.2.7 — UN VRAI ARC (demande utilisateur), plus une vague. Les deux cubiques à
      // tangente horizontale donnaient une ondulation molle et couchée ; c'est désormais une
      // DEMI-ELLIPSE, tracée dans le repère de la corde qui joint les deux pieds — elle bombe
      // donc vers le haut même quand les deux dalles ne sont pas à la même hauteur (cas d'une
      // imitatrice qui a pris la dalle la plus proche pour partenaire).
      // ⚠ Les six bandes partagent EXACTEMENT le même rayon horizontal et ne diffèrent que par
      // leur hauteur : elles passent donc toutes par les deux mêmes points et VIENNENT SE POSER
      // sur les dalles. L'ancien décalage vertical (`y1 - i * 3.2`) laissait le violet flotter
      // 16 px au-dessus du bois, et seul le rouge touchait vraiment.
      // ⚠ Pieds ORDONNÉS de gauche à droite : la demi-ellipse se trace de l'angle π à 2π, donc
      // avec une corde parcourue de droite à gauche elle se serait bombée VERS LE BAS.
      // ⚠ Rouge dehors, violet dedans — l'ordre d'un vrai arc-en-ciel, et `D_RAINBOW_COLS` est
      // déjà rangée dans ce sens : la bande i, plus basse, est aussi la plus interne.
      const x1 = x + w / 2, y1 = y, x2 = q.x + q.w / 2, y2 = q.y;
      const gx = x1 <= x2 ? x1 : x2, gy = x1 <= x2 ? y1 : y2;
      const dx2 = x1 <= x2 ? x2 : x1, dy2 = x1 <= x2 ? y2 : y1;
      const cx = (gx + dx2) / 2, cy = (gy + dy2) / 2;
      const rx = Math.hypot(dx2 - gx, dy2 - gy) / 2;
      if (rx > 6) {
        const rot = Math.atan2(dy2 - gy, dx2 - gx);
        ctx.save(); ctx.lineCap = 'round'; ctx.globalAlpha = 0.82;
        D_RAINBOW_COLS.forEach((col, i) => {
          const ry = Math.max(8, rx * 0.95 - i * 4);
          ctx.strokeStyle = col; ctx.lineWidth = 3.2;
          ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, rot, Math.PI, Math.PI * 2);
          ctx.stroke();
        });
        ctx.restore();
      }
    }
    const n = D_RAINBOW_COLS.length, bw = w / n;
    ctx.save(); doodleRR(ctx, x, y, w, h, 6, D_RAINBOW_COLS[0]); ctx.clip();
    for (let i = 0; i < n; i++) { ctx.fillStyle = D_RAINBOW_COLS[i]; ctx.fillRect(x + i * bw, y, bw + 1, h); }
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.restore();
    ctx.save(); ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🌈', x + w / 2, y + h / 2);
    ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    return;
  }
  if (p.type === 'warp') {
    doodleRR(ctx, x, y, w, h, 6, '#6b3fd4');
    ctx.fillStyle = '#40248c'; ctx.fillRect(x + 3, y + h - 4, w - 6, 3);
    ctx.strokeStyle = '#dcc8ff'; ctx.lineWidth = 2; ctx.beginPath();
    for (let a = 0; a < Math.PI * 3.4; a += 0.28) { const rr = 1 + a * 1.5; ctx.lineTo(x + w / 2 + Math.cos(a) * rr, y + h / 2 + Math.sin(a) * rr * 0.42); }
    ctx.stroke();
    return;
  }
  // 💀 Case cauchemardesque : dalle noire fendue d'où deux yeux rouges guettent, entourée
  // d'une aura qui bat. Elle doit se voir de loin et faire hésiter : c'est un piège assumé.
  if (p.type === 'nightmare') {
    ctx.save();
    ctx.globalAlpha = 0.28 + Math.sin(t * 0.12) * 0.2;
    doodleRR(ctx, x - 5, y - 5, w + 10, h + 10, 9, '#e2564a');
    ctx.restore();
    doodleRR(ctx, x, y, w, h, 6, '#191019');
    ctx.fillStyle = '#0b060b'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.strokeStyle = '#8a1f2a'; ctx.lineWidth = 1.4;                          // fissures
    [0.2, 0.46, 0.74].forEach(f => { ctx.beginPath(); ctx.moveTo(x + w * f, y + 1); ctx.lineTo(x + w * f + 4, y + h / 2); ctx.lineTo(x + w * f - 2, y + h - 2); ctx.stroke(); });
    [-9, 9].forEach(dx => {                                                     // les yeux
      ctx.save(); ctx.globalAlpha = p.used ? 0.5 : 0.6 + Math.sin(t * 0.17) * 0.4;
      ctx.fillStyle = p.used ? '#5a3a3a' : '#ff3b30';
      ctx.beginPath(); ctx.ellipse(x + w / 2 + dx, y + h / 2, 3.4, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    if (p.used) doodleTileSpent(ctx, p);
    return;
  }
  // 🕯️ Esprits : dalle d'un violet sourd sur laquelle trois petites âmes montent en flottant.
  if (p.type === 'spirit') {
    doodleRR(ctx, x, y, w, h, 6, '#4a3d6b');
    ctx.fillStyle = '#2a2142'; ctx.fillRect(x, y + h - 4, w, 4);
    [0.24, 0.5, 0.76].forEach((f, i) => {
      const gy = y + h / 2 + Math.sin(t * 0.09 + i * 2.1) * 2.4;
      ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(t * 0.11 + i * 1.7) * 0.4;
      ctx.fillStyle = '#efe6ff';
      ctx.beginPath(); ctx.arc(x + w * f, gy - 1, 3.4, Math.PI, 0);
      ctx.lineTo(x + w * f + 3.4, gy + 3); ctx.lineTo(x + w * f, gy + 1.4); ctx.lineTo(x + w * f - 3.4, gy + 3);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3a2a55';
      [-1.4, 1.4].forEach(dx => { ctx.beginPath(); ctx.arc(x + w * f + dx, gy - 1.4, 0.8, 0, Math.PI * 2); ctx.fill(); });
      ctx.restore();
    });
    if (p.used) doodleTileSpent(ctx, p);
    return;
  }
  // 🪙 Quitte ou double : une pièce qui tourne sur la tranche, ×2 d'un côté, 0 de l'autre.
  // Le battement de la pièce dit qu'il ne s'est encore rien joué ; une fois pariée, elle se fige.
  if (p.type === 'gamble') {
    doodleRR(ctx, x, y, w, h, 6, '#2f3b4a');
    ctx.fillStyle = '#1a2430'; ctx.fillRect(x, y + h - 4, w, 4);
    const cx2 = x + w / 2, cy2 = y + h / 2;
    const sp = p.used ? 1 : Math.abs(Math.cos(t * 0.07));                      // largeur de la pièce vue de biais
    const face = p.used || Math.cos(t * 0.07) >= 0;
    ctx.fillStyle = '#ffd54a'; ctx.strokeStyle = '#8a6a12'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(cx2, cy2, Math.max(1.2, 7 * sp), 5.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (sp > 0.55) {
      ctx.fillStyle = '#8a6a12'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(face ? '×2' : '0', cx2, cy2 + 0.5);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    if (p.used) doodleTileSpent(ctx, p);
    return;
  }
  // 🚇 10.10.4 — LE TUYAU REFAIT (demande utilisateur : « trop gros, pas représentatif de
  // Mario »). Il occupait TOUTE la largeur de la dalle, col compris : à 68 px de large sur
  // 14 de haut, ce n'était plus un tuyau mais une brique verte coiffée d'un couvercle.
  // ⚠ Les proportions viennent du modèle : un fût ÉTROIT (moins de la moitié de la dalle),
  // un col à peine plus large que lui (4 px de débord de chaque côté, pas 8) et MINCE, et
  // surtout le tuyau PLANTÉ DANS UN SOL qui, lui, traverse la dalle. C'est le sol qui porte,
  // le tuyau n'est que l'objet posé dessus — et c'est exactement ce qui le rend lisible.
  // ⚠ Il monte plus haut qu'avant (D_PIPE_RISE) tout en étant plus étroit : la silhouette qui
  // dit « tuyau » est verticale, pas horizontale. Étalé, il redevenait une plateforme.
  // ⚠ L'ombrage est en BANDES VERTICALES franches (clair à gauche, sombre à droite) : c'est la
  // signature du tuyau de Mario, un dégradé doux ne l'aurait pas donnée.
  // ⚠ L'anneau du col prend la couleur de la PAIRE : c'est le seul moyen de dire, avec trois
  // tuyaux à l'écran, lequel répond auquel.
  // ⚠ Purement décoratif : la boîte de collision reste le rectangle de la dalle.
  if (p.type === 'pipe') {
    const col = D_PIPE_PAL[((p.pipe || 1) - 1) % D_PIPE_PAL.length];
    const cx = x + w / 2;
    const fw = 15, cw = 19, ch = D_PIPE_COL_H;      // demi-largeurs du fût et du col, hauteur du col
    const cy = y - D_PIPE_RISE, sy = cy + ch;       // haut du col, puis haut du fût
    // ── le SOL dans lequel le tuyau est planté : il traverse toute la dalle et c'est lui qui porte ──
    doodleRR(ctx, x, y, w, h, 5, '#2f6b23');
    ctx.fillStyle = '#5aa83c'; ctx.fillRect(x + 2, y + 1, w - 4, 2.5);      // la ligne d'herbe
    ctx.fillStyle = '#173f12'; ctx.fillRect(x, y + h - 4, w, 4);            // et son assise
    // ── le fût, étroit, planté jusque dans le sol ──
    ctx.fillStyle = '#3fa62f'; ctx.fillRect(cx - fw, sy, fw * 2, (y + 5) - sy);
    ctx.fillStyle = '#8ce86a'; ctx.fillRect(cx - fw + 2, sy, 4, (y + 5) - sy);          // bande claire
    ctx.fillStyle = '#1c5417'; ctx.fillRect(cx + fw - 6, sy, 4, (y + 5) - sy);          // bande sombre
    ctx.strokeStyle = '#12380e'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx - fw + 0.6, sy); ctx.lineTo(cx - fw + 0.6, y + 5);
    ctx.moveTo(cx + fw - 0.6, sy); ctx.lineTo(cx + fw - 0.6, y + 5); ctx.stroke();
    // ── le col : à peine plus large que le fût, et mince ──
    doodleRR(ctx, cx - cw, cy, cw * 2, ch, 2, '#3fa62f');
    ctx.fillStyle = '#8ce86a'; ctx.fillRect(cx - cw + 2, cy + 1, 4, ch - 2);
    ctx.fillStyle = '#1c5417'; ctx.fillRect(cx + cw - 6, cy + 1, 4, ch - 2);
    // ⚠ La gueule est dessinée EN DERNIER et sur toute la largeur du fût : posée avant les
    // bandes d'ombrage, elle disparaissait sous elles, et le col n'était plus qu'une barre.
    ctx.fillStyle = '#0d2a0a'; ctx.fillRect(cx - fw + 1, cy + 1.2, (fw - 1) * 2, 3.2);
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(cx - fw + 1, cy + 1.2, (fw - 1) * 2, 1);   // le reflet sur la lèvre
    ctx.strokeStyle = col; ctx.lineWidth = 1.1;                                          // anneau de paire
    doodleRR(ctx, cx - cw + 0.55, cy + 0.55, cw * 2 - 1.1, ch - 1.1, 2, 'rgba(0,0,0,0)'); ctx.stroke();
    // ⚠ Le tuyau ÉPUISÉ doit se voir de loin, sinon on saute dessus en comptant sur un voyage
    // qui n'aura pas lieu : deux planches clouées en croix par-dessus la gueule, et le voile
    // des tuiles usées. Le repos (`pcool`) ne porte que le voile — il ne dure qu'un instant.
    if (p.pused) {
      ctx.save(); ctx.translate(cx, cy + ch / 2);
      [-0.42, 0.42].forEach(a => {
        ctx.save(); ctx.rotate(a);
        ctx.fillStyle = '#a9793f'; ctx.fillRect(-cw - 2, -2.2, (cw + 2) * 2, 4.4);
        ctx.fillStyle = '#6d4a22'; ctx.fillRect(-cw - 2, 0.9, (cw + 2) * 2, 1.3);
        ctx.restore();
      });
      ctx.restore();
    }
    if (p.pused || p.pcool > 0) doodleTileSpent(ctx, p);       // épuisé ou au repos : la bouche se voile
    return;
  }
  // 🔀 Randomiseur : les deux flèches croisées du symbole « aléatoire ». Elles oscillent tant
  // que la dalle n'a pas servi, puis se figent sous le voile des tuiles épuisées.
  if (p.type === 'shuffle') {
    doodleRR(ctx, x, y, w, h, 6, '#8e5bd8');
    ctx.fillStyle = '#4d2b7a'; ctx.fillRect(x + 3, y + h - 4, w - 6, 3);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (!p.used) ctx.rotate(Math.sin(t * 0.06) * 0.3);
    ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    [1, -1].forEach(sg => {
      ctx.beginPath();
      ctx.moveTo(-11, sg * 3.4);
      ctx.bezierCurveTo(-3, sg * 3.4, 3, -sg * 3.4, 9, -sg * 3.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(5.8, -sg * 6.4); ctx.lineTo(10.2, -sg * 3.4); ctx.lineTo(5.8, -sg * 0.4);
      ctx.stroke();
    });
    ctx.restore();
    if (p.used) doodleTileSpent(ctx, p);
    return;
  }
  // 🪝 Grappin : treuil de fer avec sa bobine, sa manivelle et le croc rangé dessus — la corde,
  // elle, n'est dessinée que quand elle est lancée (voir doodleDraw).
  if (p.type === 'grapple') {
    doodleRR(ctx, x, y, w, h, 6, '#6b6270');
    ctx.fillStyle = '#3a3440'; ctx.fillRect(x, y + h - 4, w, 4);
    const cx = x + w / 2, cy = y + h / 2;
    ctx.fillStyle = '#c9ced6'; ctx.strokeStyle = '#3a3440'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // la bobine
    ctx.strokeStyle = '#3a3440'; ctx.lineWidth = 1.1;
    for (let i = 0; i < 3; i++) { const a = t * 0.05 + i * 2.09; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 4.4, cy + Math.sin(a) * 4.4); ctx.stroke(); }
    ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 2;                                  // le croc au repos
    ctx.beginPath(); ctx.arc(x + w - 12, y + 5, 3.4, -0.4, Math.PI * 1.3); ctx.stroke();
    return;
  }
  // ⏲️ Balancier : caisse d'horloge en bois sombre, pivot de laiton, tige et masse pendues
  // SOUS la dalle. ⚠ La masse est dessinée dans la même passe que la dalle : elle sort de la
  // boîte de la plateforme, exactement comme le mât du 🚩 Drapeau ou les piques de la 🧊
  // Stalactite, et c'est ce qui la rend visible bien avant qu'on arrive à sa hauteur.
  // ⚠ Le sillage (trois fantômes en arrière de la course) n'est pas décoratif : c'est lui qui
  // dit DANS QUEL SENS la masse va, l'information dont on a besoin pour choisir son saut.
  if (p.type === 'pendul') {
    doodleRR(ctx, x, y, w, h, 6, '#4a3526');
    ctx.fillStyle = '#2b1d14'; ctx.fillRect(x, y + h - 4, w, 4);
    const cx = x + w / 2, cy = y + h;
    const a0 = doodlePendAng(p, t);
    // sens de la course, pour orienter le sillage derrière la masse
    const dir = Math.cos(t * D_PEND_SPD + (p.pph || 0)) >= 0 ? 1 : -1;
    for (let i = 3; i >= 1; i--) {
      const a = a0 - dir * i * 0.16 * D_PEND_ANG;
      const gx = cx + Math.sin(a) * D_PEND_LEN, gy = cy + Math.cos(a) * D_PEND_LEN;
      ctx.globalAlpha = 0.10 * (4 - i);
      ctx.fillStyle = '#c9ced6';
      ctx.beginPath(); ctx.arc(gx, gy, D_PEND_R * 0.86, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const bx = cx + Math.sin(a0) * D_PEND_LEN, by = cy + Math.cos(a0) * D_PEND_LEN;
    ctx.strokeStyle = '#8f7a5a'; ctx.lineWidth = 2.4;                     // la tige de laiton
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke();
    ctx.fillStyle = '#d8b45a';                                           // le pivot
    ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8f97a4'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(bx, by, D_PEND_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8ecf2';                                           // le reflet, qui donne le volume
    ctx.beginPath(); ctx.arc(bx - D_PEND_R * 0.34, by - D_PEND_R * 0.34, D_PEND_R * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8b45a';                                           // le cadran gravé sur la caisse
    ctx.beginPath(); ctx.arc(cx, y + h / 2, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4a3526'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(cx, y + h / 2); ctx.lineTo(cx, y + h / 2 - 2.4); ctx.stroke();
    return;
  }
  // 🟦 Sauvé par le TARDIS : dalle d'ardoise sombre, marquée au sol des empreintes de la cabine
  // et surmontée d'une lanterne qui bat — c'est ce qui la fait repérer de loin dans le Cosmos.
  // ⚠ La cabine n'est PAS dessinée sur la dalle : elle arrive à l'appel, et la voir déjà posée
  // aurait démenti l'arrivée par le côté.
  if (p.type === 'tardis') {
    doodleRR(ctx, x, y, w, h, 6, '#233a5e');
    ctx.fillStyle = '#12213a'; ctx.fillRect(x, y + h - 4, w, 4);
    const cx = x + w / 2;
    ctx.strokeStyle = 'rgba(122,206,255,0.85)'; ctx.lineWidth = 1.4;
    ctx.strokeRect(cx - 9, y + 3, 18, h - 7);                      // l'empreinte au sol de la cabine
    ctx.strokeStyle = 'rgba(122,206,255,0.40)';
    ctx.strokeRect(cx - 13, y + 2, 26, h - 5);
    const lum = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.14));      // la lanterne, posée au-dessus
    ctx.fillStyle = 'rgba(255,244,190,' + (0.26 * lum).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(cx, y - 6, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff4be'; ctx.strokeStyle = '#0b1c33'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, y - 6, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (p.tar) doodleTileSpent(ctx, p);                            // une cabine par dalle : on doit voir qu'elle est passée
    return;
  }
  // ⛓️ Chaîne : dalle de fer noir, avec l'anneau d'ancrage d'où part la chaîne. ⚠ La chaîne
  // elle-même est dessinée dans `doodleDraw`, à partir de la PAIRE : la tracer ici aurait obligé
  // chaque dalle à retrouver sa jumelle, et deux moitiés de chaîne se seraient croisées.
  if (p.type === 'chain') {
    doodleRR(ctx, x, y, w, h, 4, '#3f4048');
    ctx.fillStyle = '#1d1e24'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.strokeStyle = '#22232a'; ctx.lineWidth = 1.2;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + i * w / 4, y + 2); ctx.lineTo(x + i * w / 4, y + h - 4); ctx.stroke(); }
    ctx.fillStyle = '#6b6d78';                                        // les quatre rivets
    for (const rx of [x + 5, x + w - 5]) for (const ry of [y + 4, y + h - 6]) { ctx.beginPath(); ctx.arc(rx, ry, 1.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#8f929c'; ctx.lineWidth = 2.4;                 // l'anneau d'ancrage
    ctx.beginPath(); ctx.arc(x + w / 2, y + h + 2, 4, -0.5, Math.PI + 0.5); ctx.stroke();
    return;
  }
  // 🦴 Ossuaire : un TAS DE CRÂNES empilés les uns sur les autres, et leurs orbites ROUGEOIENT
  // toutes ensemble à l'approche de la prochaine sortie — c'est le compte à rebours, visible.
  // ⚠ 12.7.7 — Deux fémurs croisés et un crâne unique (l'ancien dessin) faisaient un blason, pas
  // un ossuaire. Trois assises décalées d'un demi-crâne, dessinées du fond vers l'avant : c'est
  // le DÉCALAGE et le recouvrement qui font lire « empilé » plutôt qu'« aligné ».
  // ⚠ Inclinaisons et tailles tirées de l'ABSCISSE de la dalle, jamais au sort : deux ossuaires
  // n'ont pas la même pile, mais une même dalle garde la sienne d'une frame à l'autre.
  if (p.type === 'ossuary') {
    doodleRR(ctx, x, y, w, h, 5, '#6b6252');
    ctx.fillStyle = '#443f34'; ctx.fillRect(x, y + h - 4, w, 4);
    const pret = p.skelT == null ? 1 : Math.max(0, Math.min(1, 1 - p.skelT / D_SKEL_EVERY));
    const eye = 'rgb(' + Math.round(30 + pret * 225) + ',' + Math.round(24 + pret * 40) + ',30)';
    const skull = (cx, cy, r, tilt) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt);
      ctx.fillStyle = '#efeadb'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = Math.max(0.7, r * 0.17);
      ctx.beginPath();                                                  // la mâchoire, sous la boîte
      ctx.moveTo(-r * 0.5, r * 0.5); ctx.lineTo(-r * 0.4, r * 1.15); ctx.lineTo(r * 0.4, r * 1.15); ctx.lineTo(r * 0.5, r * 0.5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // la boîte crânienne
      ctx.fillStyle = eye;                                              // les orbites, qui rougeoient
      [-1, 1].forEach(sg => { ctx.beginPath(); ctx.ellipse(sg * r * 0.42, -r * 0.08, r * 0.29, r * 0.33, 0, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = '#2b2b33';                                        // l'os nasal
      ctx.beginPath(); ctx.moveTo(0, r * 0.14); ctx.lineTo(-r * 0.17, r * 0.5); ctx.lineTo(r * 0.17, r * 0.5); ctx.closePath(); ctx.fill();
      ctx.restore();
    };
    const seed = Math.abs(Math.round(p.x));
    const rows = [{ n: 6, r: 4.7, cy: y + h - 5 }, { n: 5, r: 4.4, cy: y + 4.5 }, { n: 3, r: 4, cy: y - 1 }];
    for (let ri = 0; ri < rows.length; ri++) {
      const R = rows[ri], step = (w - 8) / R.n;
      for (let i = 0; i < R.n; i++) {
        const g = (seed + ri * 31 + i * 17) % 13;
        skull(x + 4 + step * (i + 0.5), R.cy + (g % 3) * 0.5, R.r * (0.88 + (g % 5) * 0.06), (g - 6) * 0.05);
      }
    }
    return;
  }
  // 🔥 Flamme éternelle : coulée de magma à ciel ouvert, avec ses flammes au-dessus. ⚠ Les
  // flammes sont DÉTERMINISTES (t + abscisse) et non tirées au sort : une gerbe de particules
  // aurait brûlé tout le budget de dessin pour une dalle qui reste des dizaines de secondes.
  if (p.type === 'eflame') {
    doodleRR(ctx, x, y, w, h, 5, '#5a1208');
    ctx.fillStyle = '#2a0704'; ctx.fillRect(x, y + h - 4, w, 4);
    // la coulée : trois bandes de magma de plus en plus claires vers le centre
    ctx.fillStyle = '#c02b0c'; ctx.fillRect(x + 2, y + 2, w - 4, h - 7);
    ctx.fillStyle = '#ff6a1c'; ctx.fillRect(x + 4, y + 4, w - 8, h - 11);
    ctx.fillStyle = '#ffd24a';
    for (let i = 0; i < 4; i++) {
      const bx = x + 8 + i * (w - 16) / 3, bw = 3 + Math.sin(t * 0.09 + i * 1.7) * 1.6;
      ctx.fillRect(bx - bw / 2, y + 5, bw, h - 13);
    }
    // les flammes, au-dessus de la dalle : six langues et leurs escarbilles
    const FN = 6;
    for (let i = 0; i < FN; i++) doodleFlameLick(ctx, x + 6 + i * (w - 12) / (FN - 1), y + 2, t, i * 1.7 + p.x * 0.05);
    // 🔥 Les escarbilles : elles montent, dérivent et s'éteignent — c'est ce détail-là qui fait
    // passer du « dessin de flamme » au feu. ⚠ Déterministes elles aussi : leur vie est
    // (t + décalage) modulo une durée, la dalle ne mémorise rien.
    for (let i = 0; i < 5; i++) {
      const ph = i * 2.6 + p.x * 0.07, u = (t * 0.014 + i * 0.21) % 1;
      const ex = x + 8 + ((i * 41 + Math.round(p.x)) % Math.max(1, w - 16)) + Math.sin(t * 0.07 + ph) * 4 * u;
      ctx.globalAlpha = (1 - u) * (1 - u) * 0.9;
      ctx.fillStyle = u < 0.45 ? '#ffe08a' : '#ff7a1c';
      ctx.fillRect(ex, y - 3 - u * 27, 1.8, 1.8);
    }
    ctx.globalAlpha = 1;
    return;
  }
  // 🪜 Échelle de prison : platelage d'acier, avec les deux pattes d'où part l'échelle. ⚠ Les
  // barreaux sont dessinés dans `doodleDraw`, à partir de la PAIRE — comme la ⛓️ Chaîne.
  if (p.type === 'ladder') {
    doodleRR(ctx, x, y, w, h, 3, '#7d8492');
    ctx.fillStyle = '#4c525d'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.strokeStyle = '#5c6470'; ctx.lineWidth = 1.2;                 // le platelage strié
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x + i * w / 6, y + 2); ctx.lineTo(x + i * w / 6, y + h - 4); ctx.stroke(); }
    ctx.strokeStyle = '#9aa0aa'; ctx.lineWidth = 2.6;                 // les deux pattes, à l'écartement des montants
    [-D_LADDER_HALF, D_LADDER_HALF].forEach(dx => { ctx.beginPath(); ctx.moveTo(x + w / 2 + dx, y + h - 2); ctx.lineTo(x + w / 2 + dx, y + h + 5); ctx.stroke(); });
    return;
  }
  // 🌪️ Tornade de barbelés : DEUX fils tendus d'un bord à l'autre de la dalle — le fil fait
  // 100 % de la tuile, poteaux compris. ⚠ Quand il est PARTI (`p.barbOut`), la dalle le montre :
  // deux poteaux nus. Sans ça on ne saurait pas d'où vient le fil qui tourne autour de soi.
  if (p.type === 'barbed') {
    doodleRR(ctx, x, y, w, h, 4, '#5f6672');
    ctx.fillStyle = '#3b414b'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.strokeStyle = '#9aa0aa'; ctx.lineWidth = 2.4;                 // les deux poteaux, aux extrémités
    [x + 2.5, x + w - 2.5].forEach(sx => { ctx.beginPath(); ctx.moveTo(sx, y + 3); ctx.lineTo(sx, y - 13); ctx.stroke(); });
    if (!p.barbOut) { doodleBarbWire(ctx, doodleBarbLinePts(x, y, w), false); doodleBarbWire(ctx, doodleBarbLinePts(x, y - 7, w), false); }
    return;
  }
  // 🔦 Projecteur : la tourelle au centre, deux caméras de part et d'autre, et le cône de
  // lumière qui tourne. ⚠ Le cône est dessiné ICI et non dans `doodleDraw` : il appartient à la
  // dalle, il doit défiler avec elle sans qu'on ait à le réinscrire dans le monde.
  if (p.type === 'searchlight') {
    doodleRR(ctx, x, y, w, h, 4, '#4a515c');
    ctx.fillStyle = '#2c313a'; ctx.fillRect(x, y + h - 4, w, 4);
    const cx = x + w / 2, cy = y - 2, ang = doodleProjAng(p, t);
    // le cône : dégradé qui s'éteint avec la distance, comme les faisceaux des miradors du décor
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, 0, D_PROJ_R, 0);
    const chaud = p.alarm > 0;                                        // alarme en cours : le faisceau vire au rouge
    g.addColorStop(0, chaud ? 'rgba(255,90,74,0.42)' : 'rgba(255,224,138,0.34)');
    g.addColorStop(1, chaud ? 'rgba(255,90,74,0)' : 'rgba(255,224,138,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.arc(0, 0, D_PROJ_R, -D_PROJ_HALF, D_PROJ_HALF); ctx.closePath(); ctx.fill();
    ctx.restore();
    // les deux caméras, qui clignotent en rouge quand l'alarme est chaude
    [-1, 1].forEach(sx => {
      const mx = cx + sx * (w / 2 - 7);
      ctx.fillStyle = '#2c313a'; ctx.strokeStyle = '#1a1e25'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.rect(mx - 5, y - 6, 10, 6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx + sx * 5, y - 5); ctx.lineTo(mx + sx * 9, y - 3); ctx.lineTo(mx + sx * 5, y - 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = (p.alarm > 0 && Math.floor(t / 8) % 2) ? '#ff4a3a' : '#7a2018';
      ctx.beginPath(); ctx.arc(mx, y - 8, 1.8, 0, Math.PI * 2); ctx.fill();
    });
    // la tourelle
    ctx.fillStyle = '#9aa0aa'; ctx.strokeStyle = '#1a1e25'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, 5.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.fillStyle = p.alarm > 0 ? '#ff8a7a' : '#fff2c8';
    ctx.beginPath(); ctx.ellipse(5.5, 0, 3.4, 4.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    return;
  }
  // 🚦 Feu tricolore : boîtier noir à trois lampes, une seule allumée. ⚠ Les deux éteintes
  // restent visibles en sombre : c'est ce qui dit qu'il en existe trois et que ça va tourner.
  if (p.type === 'light') {
    const lit = p.lit || 0, cols = ['#3fbf6a', '#ffd54a', '#e2564a'];
    doodleRR(ctx, x, y, w, h, 6, '#2b2b33');
    ctx.fillStyle = '#15151a'; ctx.fillRect(x, y + h - 4, w, 4);
    for (let i = 0; i < 3; i++) {
      const cx = x + w / 2 + (i - 1) * 16, on = i === lit;
      if (on) { ctx.fillStyle = cols[i] + '55'; ctx.beginPath(); ctx.arc(cx, y + h / 2, 8, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = on ? cols[i] : '#4a4a55';
      ctx.beginPath(); ctx.arc(cx, y + h / 2, 4.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#15151a'; ctx.lineWidth = 1.2; ctx.stroke();
      // ⚠ Le cadeau du vert ne se prend qu'une fois : une fois pris, l'ampoule verte est BARRÉE.
      // Sans ça, on continue d'attendre le vert sous une dalle qui n'a plus rien à donner.
      if (i === 0 && p.gift) {
        ctx.strokeStyle = '#e2564a'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(cx - 4, y + h / 2 - 4); ctx.lineTo(cx + 4, y + h / 2 + 4); ctx.stroke();
      }
    }
    return;
  }
  // 🌁 Brouillard : dalle pâle à demi noyée dans des volutes qui la mangent par les bords —
  // elle est déjà à moitié invisible, ce qu'elle fera au reste se devine.
  if (p.type === 'fog') {
    doodleRR(ctx, x, y, w, h, 6, '#aab4c0');
    ctx.fillStyle = '#77828f'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = '#eef3f8';
    for (let i = 0; i < 5; i++) {
      const cx = x + 6 + ((i * 15 + t * 0.35) % (w - 8)), cy = y + 4 + Math.sin(t * 0.07 + i * 1.6) * 3;
      ctx.beginPath(); ctx.ellipse(cx, cy, 9, 3.6, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return;
  }
  // ☠️ Destructrice : dalle d'acier noir marquée d'un crâne, avec deux chevrons qui pointent
  // vers le haut et vers le bas — la zone tuée est une bande d'altitude, il faut que ça se dise.
  if (p.type === 'slayer') {
    doodleRR(ctx, x, y, w, h, 6, '#3a3038');
    ctx.fillStyle = '#1c161c'; ctx.fillRect(x, y + h - 4, w, 4);
    const cx = x + w / 2, cy = y + h / 2;
    ctx.fillStyle = '#e8e2ea';                                        // le crâne
    ctx.beginPath(); ctx.ellipse(cx, cy - 1, 5.4, 4.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(cx - 3, cy + 2.6, 6, 2.4);
    ctx.fillStyle = '#3a3038';
    [-2.1, 2.1].forEach(ox => { ctx.beginPath(); ctx.arc(cx + ox, cy - 1, 1.5, 0, Math.PI * 2); ctx.fill(); });
    ctx.strokeStyle = '#e2564a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    [-1, 1].forEach(sg => {
      const off = ((t * 0.1) % 5);
      [12, 20].forEach(dx2 => {
        ctx.beginPath();
        ctx.moveTo(cx - dx2 - 4, cy + sg * (2 + off)); ctx.lineTo(cx - dx2, cy + sg * (5 + off));
        ctx.moveTo(cx + dx2 + 4, cy + sg * (2 + off)); ctx.lineTo(cx + dx2, cy + sg * (5 + off));
        ctx.stroke();
      });
    });
    return;
  }
  // 🍄 Champignon : chapeau bombé à pois qui CHANGENT de couleur au fil du temps — c'est le
  // seul moyen de dire « hallucinogène » sans texte.
  if (p.type === 'shroom') {
    const pal = ['#ff8fc8', '#8fe8ff', '#a8ff8f', '#ffd54a', '#c9a8ff'];
    doodleRR(ctx, x, y, w, h, 6, '#f2e6d2');
    ctx.fillStyle = '#c9b79a'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillStyle = '#e2564a';                                     // le chapeau, qui déborde vers le haut
    ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.quadraticCurveTo(x + w / 2, y - 12, x + w - 4, y + 4); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 5; i++) {
      const px = x + 11 + i * (w - 22) / 4, py = y - 1 - Math.abs(Math.sin(i * 1.1)) * 3;
      ctx.fillStyle = pal[(i + Math.floor(t / 12)) % pal.length];
      ctx.beginPath(); ctx.arc(px, py, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#f6efe2';                                      // le pied
    ctx.fillRect(x + w / 2 - 3, y + 4, 6, h - 8);
    return;
  }
  // 🔴 Laser : tourelle sombre à œil rouge. ⚠ L'œil GROSSIT et s'allume pendant les dernières
  // D_TLASER_TEL frames : c'est toute l'annonce du tir, sans elle un trait lent reste un trait
  // qu'on n'a pas vu partir.
  if (p.type === 'lazer') {
    const left = p.laz == null ? D_TLASER_GAP : p.laz, tel = Math.max(0, 1 - left / D_TLASER_TEL);
    const cx = x + w / 2, cy = y + h / 2;
    const seen = p.seen !== false;                                    // 🫥 🫒 elle a perdu sa cible
    const ang = Math.atan2(p.aimY == null ? 1 : p.aimY, p.aimX == null ? 0 : p.aimX);
    const rec = p.lazFire > 0 ? (p.lazFire / D_TLASER_FLASH) * 4 : 0;   // le recul du canon au départ
    doodleRR(ctx, x, y, w, h, 6, '#4a4048');
    ctx.fillStyle = '#241f26'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillStyle = '#6b6270';                                        // le socle de la tourelle
    ctx.fillRect(cx - 9, y + 2, 18, h - 6);
    // ── le rayon de VISÉE : il part de la gueule et s'allonge à mesure que la charge monte ──
    // ⚠ Dessiné AVANT le canon : sorti de la gueule, il doit passer dessous, sinon la tourelle
    // paraît percée de part en part.
    if (seen && tel > 0) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
      ctx.strokeStyle = `rgba(226,86,74,${0.18 + tel * 0.55})`; ctx.lineWidth = 0.9 + tel * 1.4;
      ctx.setLineDash([3, 4]); ctx.lineDashOffset = -t * 0.7;
      ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(20 + 8 + tel * 30, 0); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }
    // ── l'œil, qui grossit et s'allume (l'annonce d'origine, conservée) ──
    const r = 4.2 + tel * 3.2;
    if (tel > 0) { ctx.fillStyle = `rgba(226,86,74,${0.22 + tel * 0.35})`; ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = !seen ? '#7a5a5a' : tel > 0.6 && Math.floor(t / 3) % 2 ? '#ffe9a8' : '#e2564a';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#241f26'; ctx.lineWidth = 1.2; ctx.stroke();
    // ── deux anneaux qui CONVERGENT dans l'œil : c'est la charge qui se voit se remplir ──
    // ⚠ Tracés APRÈS l'œil et son halo : dessous, ils disparaissaient sous le rouge au moment
    // précis où ils doivent le plus se voir — la fin de la charge.
    if (seen && tel > 0) {
      for (let i = 0; i < 2; i++) {
        const u = (tel * 2.4 + i * 0.5) % 1;                           // 0 = large, 1 = rentré dans l'œil
        ctx.strokeStyle = `rgba(255,240,190,${(1 - u) * 0.9})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, r + 1 + (1 - u) * 10, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // ── le CANON, tourné vers la cible, et sa gueule qui s'allume ──
    // ⚠ Dessiné EN DERNIER : sous l'œil, le halo de la charge l'avalait entièrement et la
    // tourelle n'avait plus de direction lisible à l'instant où elle compte.
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    // ⚠ Le fût part de +1 et non du centre, et il est plus étroit que l'œil : sinon il masque
    // l'œil rouge, la seule chose qui dit « laser » quand la tourelle est au repos.
    ctx.fillStyle = '#241f26'; ctx.fillRect(1 - rec, -3.4, 17, 6.8);           // l'ombre du fût
    ctx.fillStyle = '#7d7484'; ctx.fillRect(1 - rec, -2.6, 17, 5.2);
    ctx.fillStyle = '#a89fb0'; ctx.fillRect(1 - rec, -2.6, 17, 1.8);           // le jour sur le dessus
    ctx.fillStyle = '#241f26'; ctx.fillRect(14.6 - rec, -3.4, 2.4, 6.8);       // la bague de gueule
    if (seen && (tel > 0 || rec > 0)) {
      const g = Math.max(tel, p.lazFire > 0 ? p.lazFire / D_TLASER_FLASH : 0);
      ctx.fillStyle = `rgba(255,233,168,${0.3 + g * 0.65})`;
      ctx.beginPath(); ctx.arc(18 - rec, 0, 1.4 + g * 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${g * 0.8})`;
      ctx.beginPath(); ctx.arc(18 - rec, 0, 0.8 + g * 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return;
  }
  // 🥚 Tamagotchi : petite console ovale à écran, et QUATRE visages qui disent où en est son
  // appétit — c'est le seul endroit d'où le joueur peut savoir ce que lui rendra le prochain
  // rebond, et combien de balles il a déjà englouties.
  // Affamée (0 repas) elle est TRANSLUCIDE et pointillée (on la traverse, il faut que ça se voie),
  // la bouche grande ouverte ; repue (1) elle est verte, les yeux fermés de contentement, et des
  // chevrons montent de son écran — le super saut qu'elle rendra ; rassasiée (2) elle jaunit, les
  // paupières tombent et la bouche devient un trait : fin d'appétit, saut ordinaire ; gavée (3)
  // elle vire au rouge, sourcils en colère et crocs, et son œil s'allume à la charge du tir.
  // ⚠ La coque garde 3 pastilles de repas : la couleur seule ne dit pas s'il reste une bouchée
  // avant la colère, et c'est précisément la question qu'on se pose avant de tirer.
  if (p.type === 'tamagotchi') {
    const n = p.meals || 0, fed = p.tama === true, cx = x + w / 2, cy = y + h / 2;
    const mad = n >= D_TAMA_MEALS, full = n === 2;
    const body = !fed ? '#9aa3ad' : mad ? '#e2564a' : full ? '#e8c341' : '#8fd0a8';
    const foot = !fed ? '#6b727b' : mad ? '#8f2f28' : full ? '#9a7c14' : '#3f8a5c';
    // 🔴 La charge du tir se voit venir, comme sur la dalle laser : sans annonce, un trait lent
    // reste un trait qu'on ne voit pas partir.
    const tel = mad ? Math.max(0, 1 - (p.tlaz == null ? D_TAMA_GAP : p.tlaz) / D_TAMA_TEL) : 0;
    ctx.save();
    if (!fed) { ctx.globalAlpha = 0.5; ctx.setLineDash([4, 3]); }
    if (tel > 0) { ctx.fillStyle = `rgba(226,86,74,${0.18 + tel * 0.35})`; ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.6, h * 0.9, 0, 0, Math.PI * 2); ctx.fill(); }
    doodleRR(ctx, x, y, w, h, 7, body);
    ctx.fillStyle = foot; ctx.fillRect(x + 3, y + h - 4, w - 6, 3);
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + 2, y + 1, w - 4, h - 3, 6) : ctx.rect(x + 2, y + 1, w - 4, h - 3);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = mad ? '#ffe0dc' : '#e8f4e2';                    // l'écran
    ctx.beginPath(); ctx.ellipse(cx, cy, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2b33';
    if (mad) {                                                     // sourcils froncés + crocs
      ctx.lineWidth = 1.5;
      [[-5, 1], [5, -1]].forEach(([ox, sg]) => {
        ctx.beginPath(); ctx.moveTo(cx + ox - 2.6 * sg, cy - 3.4); ctx.lineTo(cx + ox + 2.6 * sg, cy - 1.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx + ox, cy - 0.2, tel > 0.6 && Math.floor(t / 3) % 2 ? 2.1 : 1.5, 0, Math.PI * 2); ctx.fill();
      });
      ctx.beginPath(); ctx.moveTo(cx - 4, cy + 3.4); ctx.lineTo(cx + 4, cy + 3.4); ctx.stroke();
      [-2.4, 0, 2.4].forEach(ox => { ctx.beginPath(); ctx.moveTo(cx + ox - 1.1, cy + 3.4); ctx.lineTo(cx + ox, cy + 1.4); ctx.lineTo(cx + ox + 1.1, cy + 3.4); ctx.closePath(); ctx.fill(); });
    } else if (full) {                                             // paupières lourdes + bouche en trait
      ctx.lineWidth = 1.5;
      [-5, 5].forEach(ox => { ctx.beginPath(); ctx.moveTo(cx + ox - 2.2, cy - 1.4); ctx.lineTo(cx + ox + 2.2, cy - 1.4); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + ox, cy + 0.4, 1.2, 0, Math.PI * 2); ctx.fill(); });
      ctx.beginPath(); ctx.moveTo(cx - 3.4, cy + 3); ctx.lineTo(cx + 3.4, cy + 3); ctx.stroke();
    } else if (fed) {                                              // yeux fermés + sourire, et le super saut annoncé
      ctx.lineWidth = 1.4;
      [-5, 5].forEach(ox => { ctx.beginPath(); ctx.arc(cx + ox, cy - 1, 2.2, Math.PI, 0); ctx.stroke(); });
      ctx.beginPath(); ctx.arc(cx, cy + 1, 3, 0, Math.PI); ctx.stroke();
      ctx.strokeStyle = '#3f8a5c'; ctx.lineWidth = 1.6;
      for (let i = 0; i < 2; i++) {
        const yy = y - 2 - i * 4 - ((t * 0.08 + i) % 1) * 3;
        ctx.beginPath(); ctx.moveTo(cx - 4, yy + 3); ctx.lineTo(cx, yy); ctx.lineTo(cx + 4, yy + 3); ctx.stroke();
      }
      ctx.strokeStyle = '#2b2b33';
    } else {                                                       // yeux ronds + bouche grande ouverte
      [-5, 5].forEach(ox => { ctx.beginPath(); ctx.arc(cx + ox, cy - 1, 1.6, 0, Math.PI * 2); ctx.fill(); });
      const m = p.eat > 0 ? 1 + Math.abs(Math.sin(t * 0.6)) * 1.5 : 1.8;
      ctx.beginPath(); ctx.ellipse(cx, cy + 2, 2.6, m, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Les 3 pastilles de repas, sur la coque, à gauche de l'écran
    for (let i = 0; i < D_TAMA_MEALS; i++) {
      ctx.fillStyle = i < n ? (mad ? '#ffd0c9' : '#2b2b33') : 'rgba(43,43,51,0.22)';
      ctx.beginPath(); ctx.arc(x + 7, y + 4 + i * 4, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return;
  }
  // 🫧 Bulle : dalle d'eau savonneuse d'où s'échappent des bulles de tailles différentes, la
  // plus grosse au centre — elle annonce celle dans laquelle on finira.
  if (p.type === 'bubble') {
    doodleRR(ctx, x, y, w, h, 6, '#7fc9e0');
    ctx.fillStyle = '#3f8ca8'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.3;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    [[0.5, 6.5, 0], [0.24, 3.6, 1.2], [0.76, 4.2, 2.4]].forEach(([f, r, ph]) => {
      const bx = x + w * f, by = y + h / 2 - Math.sin(t * 0.1 + ph) * 3, rr = r + Math.sin(t * 0.16 + ph) * 0.7;
      ctx.beginPath(); ctx.arc(bx, by, rr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(bx - rr * 0.35, by - rr * 0.35, rr * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
    });
    return;
  }
  // 🧱 Fragile : boudin mauve aux bords irréguliers, creusé d'une empreinte de plus à
  // chaque rebond — c'est le seul indice qu'elle a déjà servi et qu'elle continuera de fuir.
  if (p.type === 'clay') {
    const pr = Math.min(5, p.press || 0);
    doodleRR(ctx, x, y + pr * 0.6, w, h - pr * 0.6, 7, '#c98fe0');
    ctx.fillStyle = '#8f5fa8'; ctx.fillRect(x + 2, y + h - 4, w - 4, 4 - pr * 0.4);
    ctx.fillStyle = 'rgba(90,50,110,0.30)';
    for (let i = 0; i < pr; i++) {                                   // les empreintes, réparties
      const cx = x + 10 + (i * 13) % (w - 20);
      ctx.beginPath(); ctx.ellipse(cx, y + 4 + pr * 0.5, 4.5, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#e3bcf2';                                       // le boudin de pâte repoussé sur les côtés
    [x + 3, x + w - 3].forEach(bx => { ctx.beginPath(); ctx.arc(bx, y + h / 2 + pr * 0.3, 3 + pr * 0.35, 0, Math.PI * 2); ctx.fill(); });
    return;
  }
  // 🍿 Pop-corn : barquette rayée, grains dorés tant qu'elle n'a pas servi, flocons blancs
  // ensuite — et les flocons SAUTENT pendant l'éclatement, le seul moment qui se voit.
  if (p.type === 'popcorn') {
    doodleRR(ctx, x, y, w, h, 6, '#e05a5a');
    ctx.fillStyle = '#fff6dc';
    for (let i = 0; i < 4; i++) ctx.fillRect(x + 4 + i * (w - 8) / 4, y + 2, (w - 8) / 8, h - 6);   // les rayures de la barquette
    const jump = p.pop > 0 ? (p.pop / D_POP_LIFE) : 0;
    for (let i = 0; i < 5; i++) {
      const cx = x + 9 + i * (w - 18) / 4, cy = y + 1 - jump * (4 + (i % 3) * 3);
      if (p.popped) {                                  // flocon : trois bosses
        ctx.fillStyle = '#fff6dc';
        [[-2.5, 0], [2.5, 0], [0, -2.5]].forEach(([ox, oy]) => { ctx.beginPath(); ctx.arc(cx + ox, cy + oy, 2.6, 0, Math.PI * 2); ctx.fill(); });
      } else {                                         // grain de maïs
        ctx.fillStyle = '#e8b93a';
        ctx.beginPath(); ctx.ellipse(cx, cy, 2.4, 3, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    return;
  }
  // 🍯 Collante : dalle de miel, gouttes qui pendent sous elle et fils de colle qui s'étirent
  // à mesure que la retenue s'épuise (`squash`) — c'est ce qui fait sentir le temps qui passe.
  if (p.type === 'sticky') {
    doodleRR(ctx, x, y, w, h, 6, '#e8c341');
    ctx.fillStyle = '#a8801c'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillStyle = '#f6e08a';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + 3, w * 0.34, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    const sq = p.squash || 0;
    ctx.fillStyle = '#e8c341';
    for (let i = 0; i < 4; i++) {
      const dx = x + 9 + i * (w - 18) / 3, dl = 4 + Math.sin(t * 0.09 + i * 1.9) * 2 + sq * 7;
      ctx.beginPath(); ctx.moveTo(dx - 2.6, y + h - 2); ctx.quadraticCurveTo(dx, y + h + dl, dx + 2.6, y + h - 2); ctx.closePath(); ctx.fill();
    }
    return;
  }
  // 🪷 Origami : papier plié, une silhouette par forme — c'est la SEULE chose qui prévienne, il
  // faut donc qu'elles ne se ressemblent pas. Bandeau ordinaire (0) · accordéon dressé avec sa
  // flèche (1) · cadre évidé et translucide, où l'on voit à travers (2).
  if (p.type === 'origami') {
    const f = p.ori || 0;
    if (f === 2) {
      ctx.save(); ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#b08a3a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.rect(x + 1, y + 1, w - 2, h - 2); ctx.stroke();
      ctx.beginPath();                                            // les plis, en pointillé de traits
      for (let i = 1; i < 5; i++) { ctx.moveTo(x + i * w / 5, y + 2); ctx.lineTo(x + i * w / 5, y + h - 2); }
      ctx.stroke(); ctx.restore();
      return;
    }
    doodleRR(ctx, x, y, w, h, 6, '#f6f1e2');
    ctx.fillStyle = '#d8b46a'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.strokeStyle = '#b08a3a'; ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
    if (f === 0) {                                                // pli simple : deux rabats et l'arête centrale
      ctx.beginPath();
      ctx.moveTo(x + 2, y + h - 5); ctx.lineTo(x + w / 2, y + 2); ctx.lineTo(x + w - 2, y + h - 5);
      ctx.moveTo(x + w / 2, y + 2); ctx.lineTo(x + w / 2, y + h - 5);
      ctx.stroke();
    } else {                                                      // accordéon dressé + flèche : la détente se lit
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const px = x + 4 + i * (w - 8) / 6, py = y + (i % 2 ? h - 4 : 2); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
      ctx.fillStyle = '#3f7a24';
      ctx.beginPath(); ctx.moveTo(x + w / 2, y - 5); ctx.lineTo(x + w / 2 - 5, y + 2); ctx.lineTo(x + w / 2 + 5, y + 2); ctx.closePath(); ctx.fill();
    }
    return;
  }
  // 🧼 Savon : savonnette rose bordée de mousse, avec des bulles qui montent et glissent.
  if (p.type === 'soap') {
    doodleRR(ctx, x, y, w, h, 6, '#f2a7c8');
    ctx.fillStyle = '#c96f9a'; ctx.fillRect(x, y + h - 4, w, 4);
    doodleRR(ctx, x + 8, y + 3, w - 16, h - 9, 4, '#ffd7e8');            // le pain de savon, plus clair
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 4; i++) {
      const bx = x + 10 + ((i * 17 + t * 0.6) % (w - 20)), by = y + 4 + Math.sin(t * 0.14 + i * 1.7) * 3;
      ctx.beginPath(); ctx.arc(bx, by, 2 + (i % 2), 0, Math.PI * 2); ctx.fill();
    }
    return;
  }
  // 💧 Eau : dalle bleue à surface ondulante, deux becs verseurs aux bords (c'est de là que
  // partent les filets) et, après un rebond, une flaque qui s'étale et s'évapore.
  if (p.type === 'water') {
    doodleRR(ctx, x, y, w, h, 6, '#4aa8d8');
    ctx.fillStyle = '#2b7099'; ctx.fillRect(x, y + h - 4, w, 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) { const px = x + 4 + i * (w - 8) / 10; const py = y + 5 + Math.sin(t * 0.12 + i * 0.8) * 1.8; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
    ctx.fillStyle = '#8fd8f5';                                            // les deux becs
    [x + 3, x + w - 6].forEach(bx => ctx.fillRect(bx, y + h - 5, 3, 5));
    if (p.pool > 0) {                                                     // la flaque, qui s'évapore
      ctx.save(); ctx.globalAlpha = Math.min(0.75, p.pool / D_WATER_POOL);
      ctx.fillStyle = '#bfeaf8';
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + 3, w * 0.36, 3.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    return;
  }
  // 📡 Arc électrique : dalle métallique surmontée d'une ANTENNE (mât, deux traverses, boule au
  // sommet). ⚠ L'antenne dépasse VERS LE HAUT, hors de la boîte de la dalle : c'est ce qui la
  // rend reconnaissable de loin, et c'est de sa pointe que part l'arc.
  if (p.type === 'arc') {
    const on = doodleArcOn(t);
    doodleRR(ctx, x, y, w, h, 6, on ? '#4a6f9e' : '#6b7280');
    ctx.fillStyle = on ? '#2b4a72' : '#4b5058'; ctx.fillRect(x, y + h - 4, w, 4);
    const cx = x + w / 2;
    ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, y + h - 3); ctx.lineTo(cx, y - 9); ctx.stroke();          // le mât
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - 5, y - 2); ctx.lineTo(cx + 5, y - 2);                                     // traverses
    ctx.moveTo(cx - 3.5, y - 6); ctx.lineTo(cx + 3.5, y - 6);
    ctx.moveTo(cx - 6, y + 4); ctx.lineTo(cx, y - 2); ctx.moveTo(cx + 6, y + 4); ctx.lineTo(cx, y - 2);   // haubans
    ctx.stroke();
    ctx.fillStyle = on ? '#ffe98a' : '#8f959e';                                               // la boule au sommet, qui s'allume
    ctx.beginPath(); ctx.arc(cx, y - 10, on ? 3.2 : 2.4, 0, Math.PI * 2); ctx.fill();
    if (on) { ctx.strokeStyle = 'rgba(255,233,138,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, y - 10, 6 + Math.sin(t * 0.35) * 1.5, 0, Math.PI * 2); ctx.stroke(); }
    return;
  }
  // 🕳️ Trou noir : dalle d'un noir bleuté percée d'une spirale qui tourne — le même motif que
  // le trou noir lui-même (`doodleHole`), pour qu'on fasse le lien avant même le premier saut.
  if (p.type === 'bhole') {
    doodleRR(ctx, x, y, w, h, 6, '#241d3a');
    ctx.fillStyle = '#100c1c'; ctx.fillRect(x + 3, y + h - 4, w - 6, 3);
    ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y + 1, w - 4, h - 3); ctx.clip();
    ctx.strokeStyle = '#8f7fd8'; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let a = 0; a < Math.PI * 4; a += 0.28) { const rr = 1 + a * 1.6; ctx.lineTo(x + w / 2 + Math.cos(a + t * 0.06) * rr, y + h / 2 + Math.sin(a + t * 0.06) * rr * 0.5); }
    ctx.stroke();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, 4.5, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  // 🪐 Gravité : dalle sombre, planète cerclée au centre et trois flèches qui pointent vers le
  // BAS — le seul signe qui dise, avant même de sauter, que la dalle tire vers le sol.
  if (p.type === 'gravity') {
    doodleRR(ctx, x, y, w, h, 6, '#4a3f7a');
    ctx.fillStyle = '#241d47'; ctx.fillRect(x + 3, y + h - 4, w - 6, 3);
    ctx.save(); ctx.translate(x + w / 2, y + h / 2);
    ctx.fillStyle = '#c3b7f2'; ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(0, 0, 8.4, 2.8, -0.45, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#c3b7f2'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (const dx of [-20, 20]) {
      const cx = x + w / 2 + dx, off = (t * 0.12 + (dx > 0 ? 1.6 : 0)) % 4 - 1;
      ctx.beginPath(); ctx.moveTo(cx, y + 3 + off); ctx.lineTo(cx, y + h - 5 + off);
      ctx.moveTo(cx - 3, y + h - 8 + off); ctx.lineTo(cx, y + h - 5 + off); ctx.lineTo(cx + 3, y + h - 8 + off);
      ctx.stroke();
    }
    return;
  }
  // 🎊 Confettis : dalle festive, cornet de fête au centre et papiers qui en jaillissent.
  // ⚠ Le cornet BASCULE et les papiers montent tant que l'émetteur tourne (`p.conf > 0`) :
  // c'est le seul moyen de voir d'un coup d'œil qu'une dalle est encore en train de cracher.
  if (p.type === 'confetti') {
    const on = p.conf > 0;
    doodleRR(ctx, x, y, w, h, 6, on ? '#ff8fc8' : '#c86fa8');
    ctx.fillStyle = '#8e3f70'; ctx.fillRect(x + 3, y + h - 4, w - 6, 3);
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(on ? Math.sin(t * 0.25) * 0.35 - 0.5 : -0.5);
    ctx.fillStyle = '#ffe9a8'; ctx.strokeStyle = '#8e3f70'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(1, -5); ctx.lineTo(5, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 5; i++) {
      const a = -0.9 - i * 0.28, rr = on ? 8 + ((t * 0.5 + i * 5) % 12) : 9 + i;
      ctx.fillStyle = D_CONF_COLS[i % D_CONF_COLS.length];
      ctx.fillRect(x + w / 2 + Math.cos(a) * rr - 1.5, y + h / 2 + Math.sin(a) * rr - 1.5, 3, 3.6);
    }
    return;
  }
  // 🖌️ Peinture fraîche : la dalle est PEINTE de la teinte qu'elle donne, avec son pot et sa
  // coulure — sa couleur est toute l'information, il faut pouvoir la lire de loin et en tombant.
  if (p.type === 'paint') {
    const pt = D_PAINTS[(p.paint || 0) % D_PAINTS.length];
    doodleRR(ctx, x, y, w, h, 6, pt.body);
    ctx.fillStyle = pt.dark; ctx.fillRect(x, y + h - 4, w, 4);
    // Coulures : de la peinture encore fraîche déborde du bord bas, à des longueurs inégales.
    ctx.fillStyle = pt.dark;
    for (let i = 0; i < 3; i++) {
      const dx = x + w * (0.24 + i * 0.26), dl = 3 + ((Math.floor(t / 9) + i * 3) % 4);
      ctx.fillRect(dx - 1.6, y + h, 3.2, dl);
      ctx.beginPath(); ctx.arc(dx, y + h + dl, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    // Le pinceau, planté en travers : c'est lui qui dit « peinture » plutôt que « dalle colorée ».
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(-0.5 + Math.sin(t * 0.06) * 0.12);
    ctx.fillStyle = '#c9a06a'; ctx.fillRect(-1.8, -8, 3.6, 10);
    ctx.fillStyle = '#c3ccd4'; ctx.fillRect(-2.8, 1, 5.6, 3);
    ctx.fillStyle = pt.dark; ctx.fillRect(-3.2, 4, 6.4, 4.5);
    ctx.restore();
    ctx.save(); ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pt.icon, x + w - 11, y + h / 2);
    ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (p.used) doodleTileSpent(ctx, p);   // épuisée : elle reste une plateforme, elle ne promet plus de teinte
    return;
  }
  // 🧨 bombe : la mèche RACCOURCIT à vue d'œil, sinon on ne saurait pas quand ça part
  const lit = p.fuse > 0;
  doodleRR(ctx, x, y, w, h, 6, lit && Math.floor(p.fuse / 5) % 2 ? '#e0563c' : '#4a3f3a');
  ctx.fillStyle = '#231c19'; ctx.fillRect(x + 3, y + h - 4, w - 6, 3);
  ctx.fillStyle = '#f2b134'; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f5e6c8'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + w / 2, y + h / 2 - 5); ctx.lineTo(x + w / 2 + 5, y - (lit ? 4 + p.fuse / 8 : 6)); ctx.stroke();
}
// ⚠ Tirage UNIFORME parmi les 5, sans exclure ceux déjà obtenus : « ça en saisit 1 au hasard
// parmi les 5 » et « ils se cumulent » — retirer les doublons ferait des 5 premiers paliers
// une collection complète garantie, ce qui n'est pas ce qui est demandé.
function doodlePerkGrant(s) {
  const p = D_PERKS[Math.floor(Math.random() * D_PERKS.length)];
  s.perks[p.k]++;
  // Tout bloc RECHARGE la carapace : sans ça, un bouclier consommé au 1er palier ne
  // reviendrait jamais et le bonus vaudrait pour une seule mort de toute la partie.
  s.armorLeft = Math.max(s.armorLeft, s.perks.armor);
  s.toast = { txt: `${p.icon} ${p.label} +1 · ${p.txt}`, life: D_TOAST_LIFE };
  return p;
}
// ☠️ Case malchance : l'un des 5 malus, toujours. Les deux malus instantanés (munitions,
// embuscade) frappent tout de suite ; les trois autres posent un compte à rebours lu par la
// boucle. ⚠ Aucun malus n'est mortel en soi : ils rendent la montée difficile, ils ne la
// ferment pas — un piège tiré au hasard ne doit jamais TUER sans que le joueur ait joué.
// ⚠ La 🍀 case chance, elle, appelle directement `doodlePerkGrant` : depuis 10.0.6 elle ne
// tire plus aucun malus, c'est toute la raison d'être de cette seconde case.
function doodleUnluckyGrant(s, x, y) {
  const m = D_MALUS[Math.floor(Math.random() * D_MALUS.length)];
  if (m.k === 'jam') s.ammo = Math.max(0, s.ammo - D_JAM);
  else if (m.k === 'ambush') for (let i = 0; i < 2; i++) s.monsters.push({ x: 10 + Math.random() * (DOODLE_W - 60), y: y - 78 - i * 46, w: 44, h: 38, type: Math.floor(Math.random() * 3), alive: true, vx: 0 });
  else s[m.k] = D_MALUS_LIFE;
  s.toast = { txt: `${m.icon} ${m.label} · ${m.txt}`, life: D_TOAST_LIFE };
  return m;
}
// 🧴 Les états soignés par la Panacée qui ne sont PAS des malus de la ☠️ case malchance : ils
// viennent de tuiles et vivent chacun dans son compteur. ⚠ Même ordre et mêmes icônes que le
// bandeau des effets (`doodlePerkHud`) — c'est là que le joueur les lit, et c'est donc là que
// se juge ce que « tous les malus » veut dire.
const D_CURE_STATES = [
  { k:'frost',    icon:'🌨️' },   // gel des bonus
  { k:'sandLeft', icon:'🏜️' },   // tempête de sable
  { k:'gravLeft', icon:'🪐' },   // gravité doublée
  { k:'shroom',   icon:'🍄' },   // écran retourné
  { k:'neg',      icon:'🎨' },   // couleurs inversées
  { k:'slip',     icon:'❄️' },   // glissade en cours
];
// 🧴 Panacée : voir le commentaire de son entrée dans D_LOOT. Renvoie les icônes de ce qui a
// réellement été effacé — le toast les nomme, sinon le butin passerait pour n'avoir rien fait.
function doodleCure(s) {
  const got = [];
  for (const m of D_MALUS) if (s[m.k] > 0) { s[m.k] = 0; got.push(m.icon); }        // 🌀 🪨 🌫️ les malus à durée
  for (const c of D_CURE_STATES) if (s[c.k] > 0) { s[c.k] = 0; got.push(c.icon); }
  s.slipVx = 0;
  if (s.blind) { s.blind = false; got.push('🌁'); }
  s.hall = [];   // 🍄 les hallucinations s'en vont avec le champignon qui les faisait naître
  // Le danger DÉJÀ ARMÉ des dalles, sur tout le plateau : ce qui est sorti rentre, ce qui charge
  // repart de zéro. ⚠ Rien n'est détruit ni consommé — les tuiles se réarment ensuite comme
  // avant. La panacée achète du temps, elle ne vide pas le décor.
  let n = 0;
  for (const q of s.platforms) {
    if (q.dead) continue;
    if (q.armed) { q.armed = false; n++; }                                          // 🌵 les piques rentrent
    if (q.fuse > 0) { q.fuse = 0; n++; }                                            // 🧨 la mèche s'éteint
    if (q.laz != null && q.laz < D_TLASER_GAP) { q.laz = D_TLASER_GAP; n++; }        // 🔴 le laser recharge
    if (q.tlaz != null && q.tlaz < D_TAMA_GAP) { q.tlaz = D_TAMA_GAP; n++; }         // 🥚 le gavé aussi
    const et = doodleEffType(q);
    if ((et === 'picots' || et === 'zap') && doodleCycleOn(q, s.tw || 0)) {
      // ⚠ On REPOUSSE la phase au lieu d'inventer un drapeau « éteinte » : la fenêtre se juge
      // partout par `doodleCycleOn`, dessin compris, et un drapeau de plus aurait laissé
      // l'éclair dessiné sur une dalle devenue inoffensive.
      const cyc = et === 'zap' ? D_ZAP_CYCLE : D_PICOT_CYCLE, on = et === 'zap' ? D_ZAP_ON : D_PICOT_ON;
      q.ph = (((on - (s.tw || 0)) % cyc) + cyc) % cyc;
      n++;
    }
  }
  if (n) got.push('⚡');
  return got;
}
// 🧴 La RÉSERVE de panacées : celles bues alors qu'il n'y avait rien à soigner attendent ici.
// Dès que `doodleCure` trouve enfin quelque chose, UNE SEULE se boit — les autres continuent
// d'attendre. ⚠ Appelée une frame sur `D_CURE_HOLD_EVERY` et non à chaque frame : elle balaie
// toutes les plateformes, et un sixième de seconde de retard ne se voit pas.
const D_CURE_HOLD_EVERY = 10;
function doodleCureHold(s) {
  if (!(s.cureHold > 0)) return;
  const got = doodleCure(s);
  if (!got.length) return;
  s.cureHold--;
  s.toast = { txt: `🧴 Panacée en réserve — ${got.join(' ')} balayé${got.length > 1 ? 's' : ''}`, life: D_TOAST_LIFE * 1.4 };
}
// Bandeau des bonus acquis, en haut à gauche : sans lui, des bonus « permanents » seraient
// invisibles et on ne saurait jamais lesquels on a.
// ⚠ 9.4.0 — TOUS les effets actifs, en HAUT À DROITE (demande utilisateur) : bonus permanents,
// améliorations d'arme, boucliers et malus. Ce sont les seuls états durables invisibles
// autrement (« pourquoi mes commandes sont inversées ? »). Les pastilles se posent de DROITE
// à GAUCHE pour que le bord droit reste net quel que soit leur nombre, et repassent à la ligne
// au-delà de la largeur du plateau — au bout d'une partie, on en accumule beaucoup.
function doodlePerkHud(ctx, s, W) {
  const chips = [];
  // ❄️ Pendant le gel, les pastilles des bonus et des améliorations passent en bleu pâle :
  // elles restent affichées (rien n'est perdu) mais annoncent qu'elles ne servent à rien.
  const froz = doodleFrozen(s);
  const bg0 = froz ? 'rgba(160,205,230,0.75)' : 'rgba(255,255,255,0.82)', fg0 = froz ? '#2a5570' : '#3a2a10';
  if (froz) chips.push({ t: `❄️${Math.ceil(s.frost / 60)}s`, bg:'rgba(63,111,216,0.92)', fg:'#fff' });
  for (const p of D_PERKS) if (s.perks[p.k] > 0) chips.push({ t: `${p.icon}${s.perks[p.k] > 1 ? '×' + s.perks[p.k] : ''}`, bg:bg0, fg:fg0 });
  for (const l of D_LOOT) {
    if (l.k === 'ammo' || !s.wpn || !s.wpn[l.k]) continue;
    // ⏳ Le bouclier temporel n'affiche pas ses charges mais ses POINTS restants : c'est en
    // points qu'il se consomme, un « ×2 » ne dirait rien de ce qu'il reste.
    if (l.k === 'shTime') { if (s.shTimeLeft > 0) chips.push({ t: `${l.icon}${s.shTimeLeft}`, bg:'rgba(90,190,255,0.9)', fg:'#0b2a3d' }); continue; }
    // ✴️ On affiche les LAMES encore en vol, pas le nombre de coffres ouverts : c'est le seul
    // chiffre qui dise ce qu'il reste de protection.
    if (l.k === 'shuriken') { const n = (s.shur || []).length; if (n) chips.push({ t: `${l.icon}×${n}`, bg:'rgba(230,235,242,0.92)', fg:'#2b2b33' }); continue; }
    chips.push({ t: `${l.icon}${s.wpn[l.k] > 1 ? '×' + s.wpn[l.k] : ''}`, bg: l.k.startsWith('sh') ? 'rgba(255,255,255,0.82)' : bg0, fg: l.k.startsWith('sh') ? '#3a2a10' : fg0 });   // les boucliers ne gèlent pas : leur pastille ne doit pas le laisser croire
  }
  for (const m of D_MALUS) if (s[m.k] > 0) chips.push({ t: `${m.icon}${Math.ceil(s[m.k] / 60)}s`, bg:'rgba(226,86,74,0.9)', fg:'#fff' });
  // ⚠ Effets de TUILES en cours : ils durent au-delà de la dalle qui les a posés, donc rien à
  // l'écran ne les expliquerait autrement (« pourquoi je saute si haut d'un coup ? »).
  if (s.rebLeft > 0) chips.push({ t: `🦘×${s.rebLeft}`, bg:'rgba(63,191,106,0.92)', fg:'#08301a' });
  if (s.bambLeft > 0) chips.push({ t: `🎋×${s.bambLeft}`, bg:'rgba(123,191,58,0.92)', fg:'#123008' });
  if (s.zoom && Math.abs(s.zoom - 1) > 0.005) chips.push({ t: `${s.zoom > 1 ? '🔍' : '🔎'}${Math.round(s.zoom * 100)}%`, bg:'rgba(90,168,194,0.92)', fg:'#04252f' });
  if (s.sandLeft > 0) chips.push({ t: `🏜️${Math.ceil(s.sandLeft / 60)}s`, bg:'rgba(232,201,138,0.94)', fg:'#5c3a10' });
  if (s.gravLeft > 0) chips.push({ t: `🪐${Math.ceil(s.gravLeft / 60)}s`, bg:'rgba(122,96,196,0.92)', fg:'#fff' });
  if (s.shroom > 0) chips.push({ t: `🍄${Math.ceil(s.shroom / 60)}s`, bg:'rgba(226,86,74,0.92)', fg:'#fff' });
  if (s.neg > 0) chips.push({ t: `🎨${Math.ceil(s.neg / 60)}s`, bg:'rgba(60,60,70,0.92)', fg:'#fff' });
  if (s.blind) chips.push({ t: '🌁', bg:'rgba(150,160,172,0.92)', fg:'#1c2028' });
  // 🧴 Panacées en attente : sans pastille, une réserve qui se boit toute seule plus tard
  // passerait pour un butin volé.
  if (s.cureHold > 0) chips.push({ t: `🧴×${s.cureHold}`, bg:'rgba(255,255,255,0.82)', fg:'#3a2a10' });
  // 🖌️ Teinte portée : la peau la dit déjà, mais elle ne dit NI son nom NI ce qu'il en reste.
  // ⚠ Une teinte consommable (`life: 0`) affiche son icône seule : elle n'a pas de compte à rebours.
  if (s.skin) {
    const pd = doodlePaintDef(s.skin.k);
    if (pd) chips.push({ t: `${pd.icon}${s.skin.left > 0 ? Math.ceil(s.skin.left / 60) + 's' : ''}`, bg: pd.body, fg: pd.eye });
  }
  // 🎯 Une pastille PAR quête, chacune sous SON icône : trois 🎯 identiques n'auraient pas dit
  // quel compteur appartient à quel défi.
  if (s.quests) s.quests.forEach(q => chips.push({ t: `${q.icon}${doodleQuestDone(s, q)}/${q.n}`, bg:'rgba(99,196,90,0.92)', fg:'#08301a' }));
  // 🏅 La quête ultime : trois pastilles DORÉES, une par objectif. Elles reprennent les icônes
  // des trois défis d'origine — c'est leur suite — et seule la couleur dit qu'on est à l'étage
  // au-dessus.
  if (s.ultime) {
    const u = doodleUltDone(s);
    [[`💀${u.kills}/${D_ULT_KILLS}`], [`🧩${u.kinds}/${D_ULT_KINDS}`], [`👹${u.boss}/${D_ULT_BOSS}`]]
      .forEach(([t]) => chips.push({ t, bg:'rgba(255,213,74,0.94)', fg:'#3a2a10' }));
  }
  if (s.beltLeft > 0) chips.push({ t: `${s.beltSoap ? '🧼' : s.beltVx > 0 ? '➡️' : '⬅️'}${Math.ceil(s.beltLeft / 60)}s`, bg:'rgba(255,213,74,0.92)', fg:'#3a2a10' });   // ➡️ sans elle, on subit la dérive sans savoir ni pourquoi ni pour combien de temps
  if (s.scoreMul && s.scoreMul > 1.001) chips.push({ t: `📈×${s.scoreMul.toFixed(2)}`, bg:'rgba(224,161,58,0.92)', fg:'#3a2a10' });
  // ☯️ Le prix payé à la Yin et Yang. ⚠ Affiché en PERMANENCE dès qu'il dépasse 1 : c'est un
  // engagement pris pour toute la partie, pas un effet qui passe, et rien d'autre ne le dirait.
  if (s.mobRate && s.mobRate > 1.001) chips.push({ t: `👾×${s.mobRate.toFixed(2)}`, bg:'rgba(122,75,208,0.92)', fg:'#fff' });
  if (s.mobTime != null && s.mobTime !== 1) chips.push({ t: s.mobTime === 0 ? '⏸️' : '⏸️×2', bg: s.mobTime === 0 ? 'rgba(63,111,216,0.92)' : 'rgba(192,57,43,0.92)', fg:'#fff' });
  if (!chips.length) return;
  ctx.save(); ctx.font = 'bold 12px sans-serif'; ctx.textBaseline = 'middle';
  let x = W - 8, y = 6;
  for (const c of chips) {
    const w = ctx.measureText(c.t).width + 10;
    if (x - w < 4) { x = W - 8; y += 23; }        // retour à la ligne
    doodleRR(ctx, x - w, y, w, 20, 6, c.bg);
    ctx.fillStyle = c.fg; ctx.fillText(c.t, x - w + 5, y + 10.5);
    x -= w + 4;
  }
  ctx.restore(); ctx.textBaseline = 'alphabetic';
}
// Bannière de changement de biome : plus grande que le toast et sur son propre canal, car les
// deux tombent au même palier de 1000 points et se seraient mutuellement écrasés.
function doodleBanner(ctx, s, W, H) {
  if (!s.banner || s.banner.life <= 0) return;
  const a = Math.min(1, s.banner.life / 40);
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
  ctx.font = 'bold 21px sans-serif';
  const w = Math.max(ctx.measureText(s.banner.txt).width, 200) + 34;
  doodleRR(ctx, W / 2 - w / 2, H / 2 - 46, w, 62, 12, 'rgba(30,32,40,0.86)');
  ctx.fillStyle = '#ffffff'; ctx.fillText(s.banner.txt, W / 2, H / 2 - 18);
  ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#ffd54a';
  ctx.fillText(s.banner.sub, W / 2, H / 2 + 2);
  ctx.restore(); ctx.textAlign = 'left';
}
function doodleToast(ctx, s, W) {
  if (!s.toast || s.toast.life <= 0) return;
  const a = Math.min(1, s.toast.life / 30);
  ctx.save(); ctx.globalAlpha = a; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
  const w = ctx.measureText(s.toast.txt).width + 18;
  doodleRR(ctx, W / 2 - w / 2, 32, w, 24, 8, 'rgba(255,213,74,0.94)');
  ctx.fillStyle = '#5a3200'; ctx.fillText(s.toast.txt, W / 2, 48);
  ctx.restore(); ctx.textAlign = 'left';
}
// Case bonus (dorée, « ? »), case chance (irisée claire, « 🍀 ») et case malchance (cramoisie
// sombre, « ☠️ »). Toutes trois se REBONDISSENT : elles sont dessinées comme une plateforme
// pleine, surmontée de leur marque.
// ⚠ Les deux cases rares ne se distinguent QUE par la couleur et la marque, et on les croise
// en tombant vite : la palette de la malchance est volontairement SOMBRE et chaude là où celle
// de la chance est CLAIRE et irisée — un simple changement de teinte n'aurait pas suffi.
function doodleCase(ctx, p, t) {
  const x = p.x, y = p.y, w = p.w, h = p.h, cx = x + w / 2;
  const lucky = p.type === 'lucky', unlucky = p.type === 'unlucky';
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  if (lucky) { g.addColorStop(0, '#6fd345'); g.addColorStop(0.5, '#4aa8e8'); g.addColorStop(1, '#9b6fe0'); }
  else if (unlucky) { g.addColorStop(0, '#e2564a'); g.addColorStop(0.5, '#7b2d8e'); g.addColorStop(1, '#2b1030'); }
  else { g.addColorStop(0, '#ffd54a'); g.addColorStop(0.5, '#ff8c3a'); g.addColorStop(1, '#e0a13a'); }
  doodleRR(ctx, x, y, w, h, 6, g);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x, y + h - 4, w, 4);
  // Pulsation : une case qui scintille se repère de loin, et c'est le seul indice qui la
  // distingue d'une plateforme ordinaire quand on descend vite.
  // Une case chance ou malchance épuisée cesse de scintiller et se ternit : elle reste là pour
  // rebondir, mais elle ne doit plus annoncer un effet qu'elle a déjà donné.
  if (p.used) { ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = '#2b2b33'; doodleRR(ctx, x, y, w, h, 6, '#2b2b33'); ctx.restore(); }
  const a = p.used ? 0.3 : 0.55 + Math.sin(t * 0.14) * 0.45;
  ctx.save(); ctx.globalAlpha = a;
  ctx.strokeStyle = unlucky ? '#ffb3ac' : lucky ? '#ffffff' : '#7a3b00'; ctx.lineWidth = 2;
  doodleRR(ctx, x + 1, y + 1, w - 2, h - 2, 5, 'rgba(0,0,0,0)'); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = unlucky ? '#ffb3ac' : lucky ? '#ffffff' : '#7a3b00';
  ctx.fillText(unlucky ? '☠️' : lucky ? '🍀' : '?', cx, y + h / 2);
  ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
// Tuile de biome : une plateforme aux couleurs du biome, marquée de son émoji. Même gabarit
// que les autres dalles — c'est la marque, pas la forme, qui dit ce qu'elle fait.
const D_BIOME_TILE_COLS = { vine:['#6fbf47','#2f7a24'], sand:['#e8c98a','#b58a4a'], gust:['#bfe9f5','#7fc9e0'] };
// 🧊 Plaque de glace : le dessin de l'ancienne tuile 🧊 Glace, supprimée en 10.1.2. Il est
// désormais l'asset du ❄️ Gel absolu, qui a repris ses effets — c'est le seul indice à
// l'écran que la dalle fait glisser, l'émoji seul ne parlant que du gel.
// 🧊 Une pique de glace : un triangle allongé, dégradé du bleu pâle au blanc, avec son arête
// claire. ⚠ Un seul dessin pour la pique PENDUE sous la dalle et pour celle qui TOMBE : deux
// fonctions séparées, et l'objet en chute aurait fini par ne plus ressembler à ce qui vient
// de décrocher.
function doodleIcicle(ctx, cx, top, w, h) {
  const g = ctx.createLinearGradient(0, top, 0, top + h);
  g.addColorStop(0, '#eaf8ff'); g.addColorStop(0.55, '#9fd8ee'); g.addColorStop(1, '#dff4ff');
  ctx.fillStyle = g; ctx.strokeStyle = '#4f93b5'; ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(cx - w / 2, top); ctx.lineTo(cx + w / 2, top); ctx.lineTo(cx, top + h); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(cx - w * 0.16, top + 2); ctx.lineTo(cx - w * 0.04, top + h * 0.6); ctx.stroke();
}
function doodleStalDraw(ctx, st) { doodleIcicle(ctx, st.x + st.w / 2, st.y, st.w, st.h); }
function doodleIcePlate(ctx, x, y, w, h) {
  doodleRR(ctx, x, y, w, h, 6, '#bfe9f5');
  ctx.fillStyle = '#7fc9e0'; ctx.fillRect(x + 3, y + h - 4, w - 6, 3);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + 8, y + 9); ctx.lineTo(x + 20, y + 3); ctx.moveTo(x + 30, y + 10); ctx.lineTo(x + 46, y + 3); ctx.stroke();
}
function doodleBiomeTile(ctx, p, t) {
  // 🌿 La liane est dessinée AVANT la dalle : elle en part et doit passer dessous. Corde qui
  // ondule lentement, feuilles alternées, et un renflement au bout pour qu'on voie où saisir.
  if (p.type === 'vine') {
    const cx = p.x + p.w / 2, wob = f => Math.sin(t * 0.045 + f * 3.4) * 7 * f;
    ctx.save(); ctx.lineCap = 'round';
    [['#1c5417', 5.5], ['#4e9c33', 3.2]].forEach(([col, lw]) => {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(cx, p.y + p.h);
      for (let i = 1; i <= 12; i++) { const f = i / 12; ctx.lineTo(cx + wob(f), p.y + p.h + D_VINE_LEN * f); }
      ctx.stroke();
    });
    ctx.fillStyle = '#7ec850'; ctx.strokeStyle = '#1c5417'; ctx.lineWidth = 1.2;
    for (let i = 2; i <= 11; i += 3) {
      const f = i / 12, lx = cx + wob(f), ly = p.y + p.h + D_VINE_LEN * f, d = i % 2 ? 1 : -1;
      ctx.beginPath(); ctx.ellipse(lx + d * 6, ly, 6, 3, d * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#4e9c33'; ctx.strokeStyle = '#1c5417'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx + wob(1), p.y + p.h + D_VINE_LEN, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  const c = D_BIOME_TILE_COLS[p.type] || ['#7ec850', '#4e8f2c'];
  const tile = doodleBiomeTileDef(p.type);
  if (p.type === 'gust') doodleIcePlate(ctx, p.x, p.y, p.w, p.h);   // ❄️ l'asset hérité de la 🧊 Glace
  else {
    doodleRR(ctx, p.x, p.y, p.w, p.h, 6, c[0]);
    ctx.fillStyle = c[1]; ctx.fillRect(p.x, p.y + p.h - 4, p.w, 4);
  }
  // 🏜️ Le sable mouvant s'assombrit après le 1er passage. ⚠ Depuis 10.1.1 il ne s'effondre
  // plus : la teinte ne dit donc plus qu'un danger, seulement qu'on est déjà passé par là.
  if (p.type === 'sand' && p.sink > 0) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(p.x, p.y, p.w, p.h); }
  ctx.save(); ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.9 + Math.sin(t * 0.1) * 0.1;
  ctx.fillText(tile ? tile.icon : '?', p.x + p.w / 2, p.y + p.h / 2);
  ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
function doodlePlatform(ctx, p, t) {
  const cols = { green: ['#7ec850', '#4e8f2c'], blue: ['#5cb8ef', '#2f7fbf'], break: ['#c68a4e', '#8a5a2c'], white: ['#eef2f5', '#c3ccd4'] };
  if (p.type === 'rainbow') return doodleRainbowPlat(ctx, p);
  if (p.type === 'perk' || p.type === 'lucky' || p.type === 'unlucky') return doodleCase(ctx, p, t || 0);
  if (D_BIOME_TILES.has(p.type) && !D_BIOME_OWNDRAW.has(p.type)) return doodleBiomeTile(ctx, p, t || 0);
  if (p.type === 'chest' || p.type === 'rrfake' || p.type === 'nightmare' || p.type === 'bambooed' || D_BIOME_OWNDRAW.has(p.type) || D_TILES.some(t2 => t2.k === p.type)) return doodleTileDraw(ctx, p, t || 0);   // ⚠ ni la 🎁 Coffre, ni les leurres 🎲, ni la 💀 cauchemardesque ne sont dans D_TILES
  const c = cols[p.type] || cols.green;
  doodleRR(ctx, p.x, p.y, p.w, p.h, 6, c[0]);
  ctx.fillStyle = c[1]; ctx.fillRect(p.x + 3, p.y + p.h - 4, p.w - 6, 3);
  if (p.type === 'break') {
    ctx.strokeStyle = '#5a3a18'; ctx.lineWidth = 1.4; ctx.beginPath();
    ctx.moveTo(p.x + p.w * 0.42, p.y); ctx.lineTo(p.x + p.w * 0.5, p.y + p.h);
    ctx.moveTo(p.x + p.w * 0.6, p.y); ctx.lineTo(p.x + p.w * 0.52, p.y + p.h); ctx.stroke();
  }
  if (p.spring) doodleSpring(ctx, p.x + p.w / 2, p.y);
  if (p.trampoline) doodleTrampoline(ctx, p.x + p.w / 2, p.y);
}
// ── Primitives partagées des créatures dessinées (style Doodle Jump : aplats vifs, gros
// contour sombre, yeux ronds démesurés). Elles évitent de réécrire dix fois le même œil.
function doodleBlob(ctx, cx, cy, rx, ry, fill) {
  ctx.fillStyle = fill; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
function doodleEye(ctx, cx, cy, r, look) {
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#15151c'; ctx.beginPath(); ctx.arc(cx + (look || 0) * r * 0.34, cy + r * 0.1, r * 0.45, 0, Math.PI * 2); ctx.fill();
}
function doodleFangs(ctx, cx, cy, w, n) {
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.2;
  for (let i = 0; i < n; i++) {
    const x = cx - w / 2 + (i + 0.5) * (w / n);
    ctx.beginPath(); ctx.moveTo(x - w / n / 2, cy); ctx.lineTo(x, cy + 5); ctx.lineTo(x + w / n / 2, cy); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}
// ☁️ 11.5.6 — AILE ET AURÉOLE DU BIOME CIEL (demande utilisateur). Les deux créatures du ciel
// partagent leur plumage et leur anneau : dessinés séparément, le chérubin et le séraphin
// finissaient par ne plus appartenir au même monde.
// Une aile part de l'épaule (`x`,`y`), s'ouvre vers `sx` (-1 = gauche) et bat avec `flap` (0→1).
// ⚠ UNE SEULE forme pleine à gros contour, bord inférieur festonné en trois plumes — trois
// ellipses détachées (l'ancien séraphin) se lisaient comme des nuages posés à côté de lui, pas
// comme une aile qui le porte.
// ⚠ Le dessous est ombré du MÊME bleu que les cumulus du décor : c'est ce qui raccroche la
// bestiole à son biome, plutôt qu'un aplat blanc qui disparaît dans les nuages du fond.
function doodleAngelWing(ctx, x, y, sx, len, ht, flap, tip, tilt) {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.55, -ht * 0.95, len, -ht * 0.28);
    ctx.quadraticCurveTo(len * 0.86, ht * 0.34, len * 0.62, ht * 0.08);
    ctx.quadraticCurveTo(len * 0.50, ht * 0.56, len * 0.32, ht * 0.22);
    ctx.quadraticCurveTo(len * 0.20, ht * 0.62, 0, ht * 0.24);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(x, y); ctx.scale(sx, 1); ctx.rotate((tilt || 0) - 0.3 + flap * 0.42);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
  path(); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.clip();                                  // le dessous, dans l'ombre
  ctx.fillStyle = 'rgba(126,168,214,0.30)';
  ctx.fillRect(0, ht * 0.06, len, ht);
  ctx.restore();
  ctx.strokeStyle = 'rgba(43,43,51,0.4)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  [0.34, 0.62].forEach(f => { ctx.beginPath(); ctx.moveTo(len * 0.1, ht * 0.02); ctx.lineTo(len * f, ht * 0.14); ctx.stroke(); });
  // Pointe dorée : réservée au séraphin, c'est le rappel du soleil du décor sur la seule
  // créature très rare du biome — la donner aussi au chérubin aurait effacé la différence.
  // ⚠ Un LISERÉ le long du bord d'attaque, pas une pastille dorée posée sur l'aile : la
  // pastille se lisait comme un objet accroché à la plume.
  if (tip) {
    ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(len * 0.12, -ht * 0.2);
    ctx.quadraticCurveTo(len * 0.56, -ht * 0.82, len * 0.93, -ht * 0.28);
    ctx.stroke();
  }
  ctx.restore();
}
// L'anneau : tracé DEUX fois, sombre et large puis doré et fin. ⚠ Un aplat doré cerné de sombre
// n'existe pas sur un trait, il faut le poser en deux passes. `rays` ajoute les éclats du
// séraphin, dans l'axe des rayons du soleil peint au fond du biome.
function doodleHalo(ctx, cx, cy, rx, rays) {
  const ry = rx * 0.34;
  if (rays) {
    ctx.save(); ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i + 0.5) / 7 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * rx * 0.92, cy + Math.sin(a) * ry * 0.92);
      ctx.lineTo(cx + Math.cos(a) * (rx + 7), cy + Math.sin(a) * (ry + 7));
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
}
// ── Créatures de biome, TOUTES DESSINÉES (9.5.1, demande utilisateur) : l'émoji jurait avec
// le trait du jeu, alors que le microbe d'origine et l'abeille étaient justes. Même grammaire
// pour les dix : aplats vifs, gros contour sombre, yeux ronds démesurés, une animation lente.
// ⚠ Le centre (cx, cy) est calculé UNE fois par `doodleMonster`, qui pose aussi le save/restore
// et le halo des très rares : une entrée de cette table ne dessine que la bestiole.
// 𓁿 Le corps d'une momie, partagé par la momie EN CHUTE et par la créature qu'elle devient.
// ⚠ Un seul dessin pour les deux : deux fonctions séparées, et l'objet qui tombe aurait fini
// par ne plus ressembler à ce qu'il devient en se posant.
function doodleMummyBody(ctx, cx, cy, w, h, t, ph) {
  const sw = Math.sin(t * 0.09 + (ph || 0)) * 1.6;
  ctx.save();
  ctx.fillStyle = '#e8dcc0'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2;
  doodleRR(ctx, cx - w / 2, cy - h / 2, w, h, w * 0.34, '#e8dcc0');
  ctx.stroke();
  // Les bandelettes : des obliques qui alternent de sens, plus une qui pend et flotte.
  ctx.strokeStyle = '#bfae8c'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const yy = cy - h / 2 + 5 + i * (h - 10) / 4, d = i % 2 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(cx - w / 2 + 2, yy - d * 2); ctx.lineTo(cx + w / 2 - 2, yy + d * 2); ctx.stroke();
  }
  ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx + w / 2 - 3, cy + 2); ctx.quadraticCurveTo(cx + w / 2 + 4 + sw, cy + 8, cx + w / 2 + 1 + sw * 2, cy + h / 2 + 2); ctx.stroke();
  // Deux fentes noires en guise d'yeux, avec la lueur ambrée au fond.
  ctx.fillStyle = '#1a1208';
  ctx.fillRect(cx - w * 0.28, cy - h * 0.14, w * 0.2, 3.2);
  ctx.fillRect(cx + w * 0.08, cy - h * 0.14, w * 0.2, 3.2);
  ctx.fillStyle = '#ffb03a';
  ctx.fillRect(cx - w * 0.24, cy - h * 0.13, w * 0.09, 1.8);
  ctx.fillRect(cx + w * 0.12, cy - h * 0.13, w * 0.09, 1.8);
  ctx.restore();
}
// Momie en chute : le corps, les bras tendus devant elle, et une traînée de poussière.
function doodleMummyFall(ctx, mu, t) {
  const cx = mu.x + mu.w / 2, cy = mu.y + mu.h / 2;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(Math.sin(mu.wt) * 0.22); ctx.translate(-cx, -cy);
  ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  [-1, 1].forEach(sx => { ctx.beginPath(); ctx.moveTo(cx + sx * mu.w * 0.3, cy - 4); ctx.lineTo(cx + sx * mu.w * 0.62, cy - 13); ctx.stroke(); });
  doodleMummyBody(ctx, cx, cy, mu.w, mu.h, t, mu.wt);
  ctx.restore();
}
const D_MOB_DRAW = {
  // 🧍 Prisonnier — combinaison à rayures, crâne rasé, boulet au pied. Il patrouille comme les
  // autres créatures ordinaires : c'est sa SILHOUETTE qui doit dire « prison », pas son
  // comportement — un biome se reconnaît d'abord à ce qu'on y voit.
  inmate(ctx, m, cx, cy, t) {
    const bob = Math.sin(t * 0.12 + m.x) * 1.4, look = m.vx > 0 ? 1 : -1;
    ctx.strokeStyle = '#3a3f4a'; ctx.lineWidth = 1.6;                  // la chaîne du boulet
    ctx.beginPath(); ctx.moveTo(cx + 4, cy + 14 + bob); ctx.lineTo(cx + 14, cy + 18 + bob); ctx.stroke();
    ctx.fillStyle = '#2c313a';
    ctx.beginPath(); ctx.arc(cx + 18, cy + 19 + bob, 5.4, 0, Math.PI * 2); ctx.fill();
    doodleBlob(ctx, cx, cy + 2 + bob, 14, 15, '#eceff3');              // le corps
    ctx.save();                                                        // les rayures, coupées à la forme du corps
    ctx.beginPath(); ctx.ellipse(cx, cy + 2 + bob, 14, 15, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#39404e';
    for (let i = -3; i <= 3; i++) ctx.fillRect(cx - 15, cy + 2 + bob + i * 7 - 1.8, 30, 3.6);
    ctx.restore();
    ctx.fillStyle = '#e8c9a8'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2;   // le crâne rasé
    ctx.beginPath(); ctx.arc(cx, cy - 13 + bob, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    doodleEye(ctx, cx - 3.4, cy - 14 + bob, 3.4, look);
    doodleEye(ctx, cx + 3.4, cy - 14 + bob, 3.4, look);
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';     // la bouche renfrognée
    ctx.beginPath(); ctx.arc(cx, cy - 5 + bob, 3.4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  },
  // 👮 Gardien — la créature TRÈS rare de la Prison, et celle que l'alarme du 🔦 Projecteur
  // fait rappliquer. Casquette, lunettes noires, matraque : massif et frontal.
  warden(ctx, m, cx, cy, t) {
    const bob = Math.sin(t * 0.09 + m.x) * 1.7, look = m.homing ? 0 : m.vx > 0 ? 1 : -1;
    ctx.strokeStyle = '#3a3f4a'; ctx.lineWidth = 4; ctx.lineCap = 'round';       // le bras et la matraque
    ctx.beginPath(); ctx.moveTo(cx + 13, cy + bob); ctx.lineTo(cx + 22, cy + 8 + bob); ctx.stroke();
    ctx.strokeStyle = '#22262e'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cx + 22, cy + 8 + bob); ctx.lineTo(cx + 30, cy - 4 + bob); ctx.stroke();
    doodleBlob(ctx, cx, cy + 3 + bob, 18, 16, '#2f5aa8');                        // l'uniforme
    ctx.fillStyle = '#1d3a6e'; ctx.fillRect(cx - 18, cy + 8 + bob, 36, 5);       // le ceinturon
    ctx.fillStyle = '#e8c45a';
    ctx.beginPath(); ctx.arc(cx, cy + 10.5 + bob, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8c9a8'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.2; // la tête
    ctx.beginPath(); ctx.arc(cx, cy - 13 + bob, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#22262e';                                                    // les lunettes noires
    ctx.fillRect(cx - 9, cy - 16 + bob, 18, 5.4);
    ctx.fillStyle = '#8fb4e8';
    ctx.fillRect(cx - 8, cy - 15.4 + bob + look * 0, 6.4, 4.2);
    ctx.fillRect(cx + 1.6, cy - 15.4 + bob, 6.4, 4.2);
    ctx.fillStyle = '#1d3a6e'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.8; // la casquette
    ctx.beginPath(); ctx.arc(cx, cy - 20 + bob, 11, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy - 20 + bob, 15, 3.4, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8c45a';
    ctx.beginPath(); ctx.arc(cx, cy - 25 + bob, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';     // la bouche sévère
    ctx.beginPath(); ctx.moveTo(cx - 4, cy - 6 + bob); ctx.lineTo(cx + 4, cy - 6 + bob); ctx.stroke();
  },
  // 💀 Squelette — crâne, cage thoracique, bras ballants. ⚠ Il a DEUX vies visuelles : debout,
  // et en tas d'os (`m.bones`), où il se recompose sous les yeux du joueur. Le second état est
  // dessiné ici et nulle part ailleurs : c'est le même monstre, pas un décor de plus.
  skel(ctx, m, cx, cy, t) {
    // — tas d'os, puis reconstruction — `k` va de 0 (effondré) à 1 (debout)
    if (m.bones > 0) {
      const k = m.bones > D_SKEL_REBUILD ? 0 : 1 - m.bones / D_SKEL_REBUILD;
      ctx.globalAlpha = 0.45 + k * 0.55;
      ctx.strokeStyle = '#efeadb'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {                                    // les os, qui se redressent
        const a0 = 1.35 + i * 0.35, a1 = -1.35 + i * 0.28;
        const ang = a0 + (a1 - a0) * k, ln = 8 + i * 1.6;
        const bx = cx + (i - 1.5) * 6 * (1 - k * 0.55), by = cy + m.h * 0.34 - k * m.h * 0.42;
        ctx.beginPath(); ctx.moveTo(bx - Math.cos(ang) * ln, by - Math.sin(ang) * ln); ctx.lineTo(bx + Math.cos(ang) * ln, by + Math.sin(ang) * ln); ctx.stroke();
      }
      ctx.fillStyle = '#efeadb'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.6;
      const sy = cy + m.h * 0.3 - k * m.h * 0.52;
      ctx.beginPath(); ctx.ellipse(cx, sy, 8.5, 7.5, (1 - k) * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    const bob = Math.sin(t * 0.13 + m.x) * 1.3, look = m.vx > 0 ? 1 : m.vx < 0 ? -1 : 0;
    ctx.strokeStyle = '#efeadb'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    [-1, 1].forEach(sx => {                                            // bras ballants
      const sw = Math.sin(t * 0.13 + m.x + (sx > 0 ? 1.6 : 0)) * 0.4;
      ctx.beginPath(); ctx.moveTo(cx + sx * 8, cy - 1 + bob);
      ctx.lineTo(cx + sx * (13 + sw * 4), cy + 10 + bob); ctx.stroke();
    });
    ctx.lineWidth = 3.6;                                               // jambes
    [-1, 1].forEach(sx => { ctx.beginPath(); ctx.moveTo(cx + sx * 3.5, cy + 8 + bob); ctx.lineTo(cx + sx * 5, cy + m.h * 0.45 + bob); ctx.stroke(); });
    ctx.fillStyle = '#e6e0cf'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.rect(cx - 7, cy - 3 + bob, 14, 13); ctx.fill(); ctx.stroke();   // la cage
    ctx.strokeStyle = '#a8a290'; ctx.lineWidth = 1.4;                  // les côtes
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cx - 6, cy + i * 4 + bob); ctx.lineTo(cx + 6, cy + i * 4 + bob); ctx.stroke(); }
    ctx.fillStyle = '#efeadb'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy - 12 + bob, 9.5, 8.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // le crâne
    ctx.fillRect(cx - 4.5, cy - 5 + bob, 9, 3.4);                      // la mâchoire
    ctx.fillStyle = '#c0270c';                                         // orbites incandescentes
    [-4, 4].forEach(dx => { ctx.beginPath(); ctx.arc(cx + dx + look * 0.8, cy - 13 + bob, 2.6, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#ff7a2a';
    [-4, 4].forEach(dx => { ctx.beginPath(); ctx.arc(cx + dx + look * 0.8, cy - 13 + bob, 1.3, 0, Math.PI * 2); ctx.fill(); });
  },
  // 👹 Démon — la créature TRÈS rare de l'Enfer : masse rouge, cornes, ailes de chauve-souris
  // battantes et queue fourchue. Massif et lent, comme tous les « très rares » : c'est sa
  // silhouette qui doit faire peur, pas sa vitesse.
  demon(ctx, m, cx, cy, t) {
    const bob = Math.sin(t * 0.08 + m.x) * 1.9, fl = Math.sin(t * 0.34) * 0.45 + 1, look = m.vx > 0 ? 1 : -1;
    ctx.fillStyle = '#9c1c14'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.2;   // les ailes, derrière — teinte RELEVÉE : l'auréole rouge des très rares noyait une membrane sombre
    [-1, 1].forEach(sx => {
      ctx.beginPath();
      ctx.moveTo(cx + sx * 12, cy - 4 + bob);
      ctx.quadraticCurveTo(cx + sx * 34, cy - 22 * fl + bob, cx + sx * 30, cy + 6 + bob);
      ctx.quadraticCurveTo(cx + sx * 22, cy - 2 + bob, cx + sx * 12, cy + 8 + bob);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#e8b0a8'; ctx.lineWidth = 1.2;                            // deux nervures : sans elles l'aile n'est qu'une tache
      [0.45, 0.75].forEach(u => { ctx.beginPath(); ctx.moveTo(cx + sx * 13, cy - 2 + bob); ctx.lineTo(cx + sx * (13 + 17 * u), cy - 12 * fl * (1 - u) + 8 * u + bob); ctx.stroke(); });
      ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.2;
    });
    ctx.strokeStyle = '#7a1410'; ctx.lineWidth = 3; ctx.lineCap = 'round';         // la queue fourchue
    ctx.beginPath();
    ctx.moveTo(cx - look * 8, cy + 12 + bob);
    ctx.quadraticCurveTo(cx - look * 26, cy + 16 + bob, cx - look * 24, cy + 2 + bob);
    ctx.stroke();
    doodleBlob(ctx, cx, cy + bob, 19, 17, '#d6291c');
    ctx.fillStyle = '#a01a10'; ctx.beginPath(); ctx.ellipse(cx, cy + 7 + bob, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8d2b0'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.8;   // les cornes
    [-1, 1].forEach(sx => {
      ctx.beginPath();
      ctx.moveTo(cx + sx * 8, cy - 13 + bob); ctx.lineTo(cx + sx * 17, cy - 26 + bob); ctx.lineTo(cx + sx * 13, cy - 11 + bob);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    doodleEye(ctx, cx - 6.5, cy - 3 + bob, 5.6, look);
    doodleEye(ctx, cx + 6.5, cy - 3 + bob, 5.6, look);
    ctx.strokeStyle = '#4a0a06'; ctx.lineWidth = 2; ctx.lineCap = 'round';         // les sourcils, qui font le rictus
    [-1, 1].forEach(sx => { ctx.beginPath(); ctx.moveTo(cx + sx * 2, cy - 9 + bob); ctx.lineTo(cx + sx * 12, cy - 5 + bob); ctx.stroke(); });
    doodleFangs(ctx, cx, cy + 9 + bob, 17, 4);
  },
  // 𓁿 Momie — tombée d'une stèle 𓂀 et posée sur sa dalle. Elle se dandine sur place : elle ne
  // se déplace pas (`perch`), c'est le balancement qui dit qu'elle est vivante.
  mummy(ctx, m, cx, cy, t) {
    const bob = Math.sin(t * 0.06 + m.x) * 1.6;
    ctx.save();
    ctx.translate(cx, cy + bob); ctx.rotate(Math.sin(t * 0.045 + m.x) * 0.09); ctx.translate(-cx, -(cy + bob));
    ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 5; ctx.lineCap = 'round';   // bras tendus devant
    [-1, 1].forEach(sx => { ctx.beginPath(); ctx.moveTo(cx + sx * m.w * 0.28, cy + bob - 2); ctx.lineTo(cx + sx * m.w * 0.66, cy + bob - 8); ctx.stroke(); });
    doodleMummyBody(ctx, cx, cy + bob, m.w, m.h, t, m.x);
    ctx.restore();
  },
  // 🐝 Bzz — bourdon vert acide à grosses dents, ailes battantes.
  bzz(ctx, m, cx, cy, t) {
    const bob = Math.sin(t * 0.11 + m.x) * 1.4, fl = Math.sin(t * 0.9) * 0.55 + 1;
    ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.4;
    // ⚠ Ailes posées LARGES et basses, pas au sommet du crâne : plus près du corps elles se
    // lisaient comme des oreilles et la bestiole n'avait plus rien d'un insecte.
    [-1, 1].forEach(sx => { ctx.beginPath(); ctx.ellipse(cx + sx * 15, cy - 6 + bob, 10, 4.5 * fl, sx * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    doodleBlob(ctx, cx, cy + bob, 15, 12, '#b6d94a');
    ctx.fillStyle = '#3f4a1c';                                            // rayures
    [-5, 2].forEach(dy => ctx.fillRect(cx - 13, cy + dy + bob, 26, 3.4));
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    [-1, 1].forEach(sx => { ctx.beginPath(); ctx.moveTo(cx + sx * 5, cy - 11 + bob); ctx.lineTo(cx + sx * 8, cy - 17 + bob); ctx.stroke(); });
    doodleEye(ctx, cx - 5, cy - 1 + bob, 4.4, m.vx > 0 ? 1 : -1);
    doodleEye(ctx, cx + 5, cy - 1 + bob, 4.4, m.vx > 0 ? 1 : -1);
    doodleFangs(ctx, cx, cy + 7 + bob, 13, 3);
  },
  // 🦉 Gluk — gros rapace lunaire, immense paire d'yeux et bec crochu. Très rare, donc massif
  // et hiératique : il ne bouge presque pas, c'est sa masse qui fait peur.
  gluk(ctx, m, cx, cy, t) {
    const bob = Math.sin(t * 0.07 + m.x) * 1.8, look = m.vx > 0 ? 1 : -1;
    ctx.fillStyle = '#7a5fc4'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.4;   // ailes repliées
    [-1, 1].forEach(sx => { ctx.beginPath(); ctx.ellipse(cx + sx * 17, cy + 3 + bob, 7, 15, sx * 0.22, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    doodleBlob(ctx, cx, cy + bob, 20, 18, '#9b7fe0');
    ctx.fillStyle = '#b9a3ef'; ctx.beginPath(); ctx.ellipse(cx, cy + 6 + bob, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
    [-1, 1].forEach(sx => {   // aigrettes
      ctx.fillStyle = '#9b7fe0'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx + sx * 6, cy - 15 + bob); ctx.lineTo(cx + sx * 13, cy - 24 + bob); ctx.lineTo(cx + sx * 15, cy - 12 + bob); ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    doodleEye(ctx, cx - 7.5, cy - 3 + bob, 7.4, look);
    doodleEye(ctx, cx + 7.5, cy - 3 + bob, 7.4, look);
    ctx.fillStyle = '#ffb03a'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.6;   // bec crochu
    ctx.beginPath(); ctx.moveTo(cx - 4, cy + 5 + bob); ctx.lineTo(cx + 4, cy + 5 + bob); ctx.lineTo(cx, cy + 14 + bob); ctx.closePath(); ctx.fill(); ctx.stroke();
  },
  // 👁 Rôdeur — gros œil unique sur un corps flottant, tentacules qui ondulent. Le seul monstre
  // qui bouge sur les deux axes, donc le seul dessiné « en apesanteur ».
  roamer(ctx, m, cx, cy, t) {
    const bob = Math.sin(t * 0.1 + m.x) * 1.6;
    ctx.strokeStyle = '#4a3f86'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const tx = cx - 13 + i * 8.7;
      ctx.beginPath(); ctx.moveTo(tx, cy + 8 + bob);
      ctx.quadraticCurveTo(tx + Math.sin(t * 0.15 + i) * 5, cy + 15 + bob, tx + Math.sin(t * 0.15 + i) * 7, cy + 21 + bob);
      ctx.stroke();
    }
    doodleBlob(ctx, cx, cy + bob, 20, 15, '#6f5fd0');
    ctx.fillStyle = '#8a7be0'; ctx.beginPath(); ctx.ellipse(cx, cy - 5 + bob, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
    doodleEye(ctx, cx, cy + 1 + bob, 8.5, m.vx > 0 ? 1 : -1);
    doodleFangs(ctx, cx, cy + 11 + bob, 18, 3);
  },
  // 🪨 Caillasseur — trapu, accroupi sur sa dalle, une pierre déjà en main. ⚠ Il ne bouge pas
  // d'un pouce : c'est SA dalle qui le porte, et cette immobilité est le seul indice qu'on a
  // affaire à un tireur posté et non à une bestiole de passage.
  // ⚠ Le bras se lève à l'approche du lancer (`throw`) : la pierre part sinon sans prévenir.
  rock(ctx, m, cx, cy, t) {
    const arm = m.throw == null ? 0 : Math.max(0, 1 - m.throw / 45);   // 0 → 1 : l'armé du bras
    const ink = '#2b2b33';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.fillStyle = '#6e6a63'; ctx.strokeStyle = ink; ctx.lineWidth = 2;   // les deux jambes repliées
    [-1, 1].forEach(sx => { ctx.beginPath(); ctx.ellipse(cx + sx * 11, cy + 12, 6, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    doodleBlob(ctx, cx, cy + 2, 17, 13, '#8f887e');
    ctx.fillStyle = '#6e6a63';                                            // plaques de pierre sur le dos
    [[-8, -5, 5], [2, -8, 6], [10, -4, 4]].forEach(([dx, dy, rr]) => { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, rr, Math.PI, 0); ctx.fill(); });
    doodleEye(ctx, cx - 6, cy, 4.4, 1); doodleEye(ctx, cx + 5, cy, 4.4, 1);
    doodleFangs(ctx, cx, cy + 9, 14, 3);
    // Le bras et sa pierre, levés au-dessus de l'épaule à mesure que le lancer approche.
    const bx = cx + 13, by = cy - 6 - arm * 11;
    ctx.strokeStyle = ink; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(cx + 9, cy + 1); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = '#8f887e'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(cx + 9, cy + 1); ctx.lineTo(bx, by); ctx.stroke();
    ctx.fillStyle = '#9a938a'; ctx.strokeStyle = ink; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(bx + 2, by - 3, 5 + arm * 1.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  },
  // 🦔 Hérissé — une boule de piques. ⚠ Les piques sont DANS la boîte de collision et pointent
  // dans toutes les directions : c'est le dessin qui doit dire « on ne saute pas là-dessus »,
  // puisque c'est la seule créature du jeu que l'écrasement ne tue pas.
  spiky(ctx, m, cx, cy, t) {
    const bob = Math.sin(t * 0.13 + m.x) * 1.5, d = m.vx > 0 ? 1 : -1, y = cy + bob;
    const puls = 1 + Math.sin(t * 0.19 + m.x) * 0.06;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // ⚠ Piques CLAIRES sur corps sombre, et non l'inverse : en violet foncé cerclé de noir,
    // la couronne disparaissait purement et simplement sur les biomes de nuit — la seule
    // créature qu'on ne doit surtout pas confondre avec une autre devenait une boule nue.
    // ⚠ Piques LARGES à la base et contour FIN : à 1,6 px de trait sur un triangle de 2,6 px
    // de large, les deux bords se rejoignaient et il ne restait plus que le noir du contour —
    // la couronne claire était mangée par son propre liseré.
    ctx.fillStyle = '#d8c8ff'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {                                        // la couronne de piques
      const a = i / 12 * Math.PI * 2 + t * 0.006;
      const r0 = 11, r1 = (19 + (i % 3) * 2.5) * puls, wdt = 0.23;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - wdt) * r0, y + Math.sin(a - wdt) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, y + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a + wdt) * r0, y + Math.sin(a + wdt) * r0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    doodleBlob(ctx, cx, y, 13, 12, '#5b4a7a');
    ctx.fillStyle = '#8a6fc0'; ctx.beginPath(); ctx.ellipse(cx, y + 4, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    doodleEye(ctx, cx - 5, y - 1, 4, d); doodleEye(ctx, cx + 5, y - 1, 4, d);
    doodleFangs(ctx, cx, y + 8, 12, 3);
  },
  // 🛡️ Réflecteur — la bestiole se cache derrière un pavois de verre bleu, tenu DEVANT elle
  // dans son sens de marche. ⚠ Le bouclier est dessiné en DERNIER, par-dessus le corps :
  // c'est lui qu'on doit voir en premier, c'est lui qui explique pourquoi le tir revient.
  shield(ctx, m, cx, cy, t) {
    const bob = Math.sin(t * 0.1 + m.x) * 1.5, d = m.vx > 0 ? 1 : -1, y = cy + bob;
    const fl = Math.max(0, (m.sh || 0) / D_SHLD_FLASH);                   // éclat du renvoi
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.fillStyle = '#3c6f8f'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.8;   // deux petites pattes
    [-1, 1].forEach(sx => { ctx.beginPath(); ctx.ellipse(cx + sx * 9 - d * 4, y + 13, 5, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    doodleBlob(ctx, cx - d * 6, y, 13, 12, '#4f8fb5');
    doodleEye(ctx, cx - d * 9, y - 2, 4.2, d); doodleEye(ctx, cx - d * 1, y - 2, 4.2, d);
    doodleFangs(ctx, cx - d * 6, y + 8, 11, 3);
    // Le pavois : une vraie PLAQUE ovale et large, pas un croissant. ⚠ Il tient dans la boîte
    // de collision (±24) : un bouclier qui dépasserait mentirait sur la zone dangereuse, et
    // c'est justement le bord qu'on essaie de contourner pour tirer.
    const sx0 = cx + d * 15;
    ctx.fillStyle = fl > 0 ? '#eaf7ff' : '#9fd6ef'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.ellipse(sx0, y, 7, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';                              // le reflet en bandeau
    ctx.beginPath(); ctx.ellipse(sx0 - d * 2, y - 3, 2.2, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(43,43,51,0.55)'; ctx.lineWidth = 1.2;          // les deux rivets
    [-9, 9].forEach(oy2 => { ctx.beginPath(); ctx.arc(sx0, y + oy2, 1.5, 0, Math.PI * 2); ctx.stroke(); });
    // Onde du renvoi. ⚠ Elle s'ouvre DANS LE SENS DE MARCHE (`d`) : écrite en dur vers la
    // droite, elle partait dans le dos de la bestiole une fois sur deux.
    if (fl > 0) {
      ctx.strokeStyle = `rgba(191,228,245,${fl})`; ctx.lineWidth = 3;
      const a0 = d > 0 ? -0.85 : Math.PI - 0.85, a1 = d > 0 ? 0.85 : Math.PI + 0.85;
      ctx.beginPath(); ctx.arc(sx0, y, 13 + (1 - fl) * 9, a0, a1); ctx.stroke();
    }
  },
  // 🐉 Dragonneau — la bête de l'œuf, et la seule créature du jeu qui riposte.
  // ⚠ Sa charge se VOIT : la gueule s'allume sur les D_HATCH_TEL dernières frames avant le
  // crachat. Un trait de feu visé qui partirait sans annonce serait une mort inesquivable.
  // ⚠ Les points de vie restants sont dessinés en pastilles au-dessus de lui : c'est le seul
  // monstre qui ne tombe pas au premier tir, et rien d'autre à l'écran ne le dirait.
  // ⚠ Tout tient dans la boîte de collision (±26 × ±22), ailes et queue comprises : un membre
  // qui dépasse ment sur la zone dangereuse, et on meurt sur un pixel qui n'en avait pas l'air.
  hatch(ctx, m, cx, cy, t) {
    const d = m.vx > 0 ? 1 : -1, y = cy + Math.sin(t * 0.12 + m.x) * 1.6;
    const tel = m.spit == null ? 0 : Math.max(0, 1 - m.spit / D_HATCH_TEL);
    const hit = m.hurt > 0;
    const body = hit ? '#ffe9e2' : '#d0533f', dark = hit ? '#c8a9a0' : '#7a2a1e', belly = hit ? '#fff6ec' : '#ffc98a';
    const ink = '#2b2b33';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Queue fouettée, terminée en fer de lance dirigé VERS L'ARRIÈRE ET LE BAS : pointée vers
    // le haut, elle se lisait comme une seconde aile. Dessinée en premier, donc sous le corps.
    const sw = Math.sin(t * 0.16 + m.x) * 3.5;
    [[ink, 7], [dark, 3.6]].forEach(([col, lw]) => {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(cx - d * 7, y + 6); ctx.quadraticCurveTo(cx - d * 17, y + 13 + sw, cx - d * 23, y + 9 + sw); ctx.stroke();
    });
    ctx.fillStyle = dark; ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx - d * 20, y + 5 + sw); ctx.lineTo(cx - d * 26, y + 12 + sw); ctx.lineTo(cx - d * 19, y + 13 + sw); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Aile membranée à doigts visibles : c'est ce qui la distingue d'un moignon arrondi, qui
    // se lisait comme une nageoire — et la bête, comme un poisson.
    // ⚠ Sa racine reste EN ARRIÈRE du garrot et sa pointe sous la ligne des cornes : plus
    // grande, elle recouvrait la tête et on ne voyait plus où la bestiole regardait.
    // ⚠ Deux exemplaires, la lointaine plus haute et plus sombre : superposées à l'identique,
    // il n'en restait qu'une à l'écran et la silhouette perdait tout son volume.
    const fl = 1 + Math.sin(t * 0.24 + m.x) * 0.28;
    const aile = (col, dy, sc) => {
      const px = cx - d * 6, py = y - 3 + dy;
      const tx = cx - d * 19 * sc, ty = py - 13 * fl * sc;
      ctx.fillStyle = col; ctx.strokeStyle = ink; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty);
      ctx.quadraticCurveTo(cx - d * 15 * sc, py + 1, cx - d * 9 * sc, py + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = ink; ctx.lineWidth = 1;   // les doigts de la membrane
      [0.45, 0.75].forEach(f => { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (tx - px) * f + d * 2, py + (ty - py) * f + 4.5); ctx.stroke(); });
    };
    aile(dark, -4, 0.84);
    doodleBlob(ctx, cx - d * 2, y + 3, 13.5, 11.5, body);
    ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(cx, y + 7, 9, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    aile(body, 0, 1);
    // Tête et museau ALLONGÉ : c'est la seule chose qui dise « dragon » plutôt qu'« oiseau ».
    ctx.fillStyle = body; ctx.strokeStyle = ink; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + d * 4, y - 12);
    ctx.quadraticCurveTo(cx + d * 16, y - 13, cx + d * 25, y - 7);       // chanfrein
    ctx.quadraticCurveTo(cx + d * 27, y - 4.5, cx + d * 24, y - 2);      // bout du museau
    ctx.quadraticCurveTo(cx + d * 15, y + 1, cx + d * 5, y + 1);         // mâchoire
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ink; [-1, 1].forEach(k => { ctx.beginPath(); ctx.arc(cx + d * 22, y - 6.5 + k * 1.5, 0.9, 0, Math.PI * 2); ctx.fill(); });   // naseaux
    ctx.fillStyle = '#f6efe2'; ctx.strokeStyle = ink; ctx.lineWidth = 1;   // crocs sous la mâchoire
    [12, 16].forEach(sx => { ctx.beginPath(); ctx.moveTo(cx + d * sx, y - 0.5); ctx.lineTo(cx + d * (sx + 1.5), y + 4); ctx.lineTo(cx + d * (sx + 3), y - 0.5); ctx.closePath(); ctx.fill(); ctx.stroke(); });
    ctx.fillStyle = dark; ctx.strokeStyle = ink; ctx.lineWidth = 1.4;      // deux cornes dressées vers l'arrière
    [0, 1].forEach(k => {
      const bx = cx + d * (6 - k * 4.5), by = y - 11 - k * 0.5;
      ctx.beginPath(); ctx.moveTo(bx + d * 2.4, by); ctx.lineTo(bx - d * 5.5, by - 9 + k * 1.5); ctx.lineTo(bx - d * 2.4, by + 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    doodleEye(ctx, cx + d * 10, y - 6, 3.6, d);
    // Le foyer qui monte dans la gueule : c'est TOUTE l'annonce du crachat, et il est calé au
    // bout du museau — un halo flottant à côté de la tête ne se serait rattaché à rien.
    if (tel > 0) {
      const gx = cx + d * 26, gy = y - 4, gr = 2 + tel * 6;
      const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr * 2.4);
      gg.addColorStop(0, `rgba(255,232,154,${0.55 + tel * 0.45})`); gg.addColorStop(0.45, `rgba(255,140,58,${0.45 * tel})`); gg.addColorStop(1, 'rgba(255,140,58,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(gx, gy, gr * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe89a'; ctx.beginPath(); ctx.arc(gx, gy, gr * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    // Points de vie restants, en pastilles au-dessus de lui.
    const n = m.hpMax || D_HATCH_HP;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i < (m.hp || 0) ? '#ffd54a' : 'rgba(43,43,51,0.30)';
      ctx.strokeStyle = ink; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx - (n - 1) * 4 + i * 8, y - 25, 2.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  },
  // 🦂 Scorpion — 🏜️ Désert. Queue dressée derrière lui, pinces AU BOUT DE BRAS devant.
  // ⚠ Les pinces sont détachées du corps par un bras visible : collées, les deux ellipses se
  // lisaient comme un museau et la bestiole passait pour un rongeur.
  // ⚠ Tout tient dans la boîte de collision (±18 × ±15) : un membre qui dépasse ment sur la
  // zone dangereuse, et on meurt sur un pixel qui n'avait pas l'air d'en être un.
  scorpion(ctx, m, cx, cy, t) {
    const d = m.vx > 0 ? 1 : -1, sw = Math.sin(t * 0.13 + m.x) * 2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2;                                  // pattes
    [0, 1, 2].forEach(i => [-1, 1].forEach(sy => {
      const bx = cx + d * (i * 5 - 7);
      ctx.beginPath(); ctx.moveTo(bx, cy + sy * 2); ctx.lineTo(bx - d * 3, cy + sy * 9); ctx.stroke();
    }));
    const tail = [[-9, 0], [-14, -4], [-15, -10 + sw]];                              // queue segmentée
    const drawTail = (col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(cx - d * 4, cy + 1); tail.forEach(([sx, sy]) => ctx.lineTo(cx + d * sx, cy + sy)); ctx.stroke(); };
    drawTail('#2b2b33', 7); drawTail('#e0a45c', 3.6);
    ctx.fillStyle = '#f2f4f7'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.4;     // dard
    ctx.beginPath(); ctx.moveTo(cx - d * 17, cy - 9 + sw); ctx.lineTo(cx - d * 10, cy - 15 + sw); ctx.lineTo(cx - d * 12, cy - 7 + sw); ctx.closePath(); ctx.fill(); ctx.stroke();
    doodleBlob(ctx, cx - d * 4, cy + 1, 8, 6.5, '#c98b47');                           // abdomen
    doodleBlob(ctx, cx + d * 4, cy, 8.5, 7, '#e0a45c');                               // céphalothorax
    [-1, 1].forEach(sy => {                                                           // bras + pinces
      ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(cx + d * 10, cy + sy * 3); ctx.lineTo(cx + d * 13, cy + sy * 7); ctx.stroke();
      ctx.fillStyle = '#e0a45c'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.ellipse(cx + d * 15, cy + sy * 8, 4.4, 2.8, d * sy * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    doodleEye(ctx, cx + d * 2, cy - 4, 3.2, d);
    doodleEye(ctx, cx + d * 7, cy - 3, 2.9, d);
  },
  // 🦅 Vautour — 🏜️ Désert, très rare. Grandes ailes lentes, tête chauve et bec crochu.
  vulture(ctx, m, cx, cy, t) {
    const d = m.vx > 0 ? 1 : -1, fl = Math.sin(t * 0.09 + m.x) * 7;
    ctx.fillStyle = '#4a4038'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.4;     // ailes
    [-1, 1].forEach(sx => {
      ctx.beginPath();
      ctx.moveTo(cx + sx * 4, cy);
      ctx.quadraticCurveTo(cx + sx * 18, cy - 10 - fl, cx + sx * 27, cy - 2 - fl);
      ctx.quadraticCurveTo(cx + sx * 18, cy + 5, cx + sx * 4, cy + 6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    doodleBlob(ctx, cx, cy + 2, 13, 12, '#5a4a42');
    ctx.fillStyle = '#3a322c'; ctx.beginPath(); ctx.ellipse(cx, cy + 7, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0f2f4'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.8;     // collerette
    ctx.beginPath(); ctx.ellipse(cx, cy - 6, 11, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    doodleBlob(ctx, cx + d * 2, cy - 13, 8, 7.5, '#e0a48f');                         // tête chauve
    ctx.fillStyle = '#ffb03a'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.6;     // bec crochu
    ctx.beginPath(); ctx.moveTo(cx + d * 7, cy - 16); ctx.lineTo(cx + d * 18, cy - 12); ctx.lineTo(cx + d * 7, cy - 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    doodleEye(ctx, cx + d * 4, cy - 15, 4.2, d);
  },
  // 🐧 Manchot — 🧊 Glacier. Petit, trapu, ventre blanc : la seule créature qui a l'air
  // sympathique, ce qui la rend d'autant plus traître.
  penguin(ctx, m, cx, cy, t) {
    const d = m.vx > 0 ? 1 : -1, wob = Math.sin(t * 0.16 + m.x) * 1.6;
    ctx.fillStyle = '#ffb03a'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.6;     // pattes
    [-1, 1].forEach(sx => { ctx.beginPath(); ctx.ellipse(cx + sx * 5, cy + 14, 5, 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    ctx.fillStyle = '#2f3b4a'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2;       // ailerons
    [-1, 1].forEach(sx => { ctx.beginPath(); ctx.ellipse(cx + sx * 12, cy + 2 + sx * wob, 4, 9, sx * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    doodleBlob(ctx, cx, cy, 12, 15, '#2f3b4a');
    ctx.fillStyle = '#f2f7fb'; ctx.beginPath(); ctx.ellipse(cx, cy + 3, 8, 11, 0, 0, Math.PI * 2); ctx.fill();
    doodleEye(ctx, cx - 4.5, cy - 6, 4.2, d);
    doodleEye(ctx, cx + 4.5, cy - 6, 4.2, d);
    ctx.fillStyle = '#ffb03a'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.4;     // bec
    ctx.beginPath(); ctx.moveTo(cx - 3.5, cy); ctx.lineTo(cx + 3.5, cy); ctx.lineTo(cx + d * 1.5, cy + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  },
  // 🦣 Yéti — 🧊 Glacier, très rare. Masse de poils blancs à ombre bleutée et grosses canines.
  // Sa fourrure est faite de bosses le long du contour : un simple ovale l'aurait rendu mou.
  yeti(ctx, m, cx, cy, t) {
    const d = m.vx > 0 ? 1 : -1, bob = Math.sin(t * 0.06 + m.x) * 1.6;
    ctx.fillStyle = '#eef4fb'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.4;
    [-1, 1].forEach(sx => { ctx.beginPath(); ctx.ellipse(cx + sx * 19, cy + 6 + bob, 6.5, 10, sx * 0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });   // bras
    ctx.beginPath();                                                                  // corps hirsute
    for (let i = 0; i <= 14; i++) {
      const a = i / 14 * Math.PI * 2, r = (i % 2 ? 1 : 0.86);
      const px = cx + Math.cos(a) * 20 * r, py = cy + bob + Math.sin(a) * 17 * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c2dfef'; ctx.beginPath(); ctx.ellipse(cx, cy + 2 + bob, 12, 10, 0, 0, Math.PI * 2); ctx.fill();   // face
    doodleEye(ctx, cx - 6, cy - 3 + bob, 5.4, d);
    doodleEye(ctx, cx + 6, cy - 3 + bob, 5.4, d);
    doodleFangs(ctx, cx, cy + 6 + bob, 15, 3);
    ctx.fillStyle = '#2b2b33'; ctx.beginPath(); ctx.ellipse(cx, cy + 1 + bob, 2.4, 1.6, 0, 0, Math.PI * 2); ctx.fill();   // museau
  },
  // 🦇 Chauve-souris — 🌋 Volcan. Ailes membranées festonnées qui battent vite, corps minuscule.
  bat(ctx, m, cx, cy, t) {
    const d = m.vx > 0 ? 1 : -1, fl = Math.sin(t * 0.3 + m.x) * 8;
    ctx.fillStyle = '#6b3550'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2;
    [-1, 1].forEach(sx => {                                                           // membrane à 3 festons
      ctx.beginPath(); ctx.moveTo(cx + sx * 3, cy - 2);
      ctx.lineTo(cx + sx * 20, cy - 8 - fl);
      ctx.quadraticCurveTo(cx + sx * 15, cy - 1 - fl * 0.5, cx + sx * 13, cy + 2);
      ctx.quadraticCurveTo(cx + sx * 9, cy + 5, cx + sx * 3, cy + 5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    doodleBlob(ctx, cx, cy, 9, 8.5, '#8a4568');
    [-1, 1].forEach(sx => {                                                           // oreilles pointues
      ctx.fillStyle = '#8a4568'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(cx + sx * 3, cy - 7); ctx.lineTo(cx + sx * 7, cy - 16); ctx.lineTo(cx + sx * 8.5, cy - 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    doodleEye(ctx, cx - 3.4, cy - 2, 3.4, d);
    doodleEye(ctx, cx + 3.4, cy - 2, 3.4, d);
    doodleFangs(ctx, cx, cy + 4, 9, 2);
  },
  // 🐉 Dragon — 🌋 Volcan, très rare. Museau en avant qui crache, cornes, ailes larges.
  dragon(ctx, m, cx, cy, t) {
    const d = m.vx > 0 ? 1 : -1, fl = Math.sin(t * 0.1 + m.x) * 6, puff = (t * 0.06 + m.x) % 6;
    ctx.fillStyle = '#a03b28'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.4;      // ailes
    [-1, 1].forEach(sx => {
      ctx.beginPath(); ctx.moveTo(cx, cy - 4);
      ctx.quadraticCurveTo(cx + sx * 16, cy - 20 - fl, cx + sx * 26, cy - 6 - fl);
      ctx.quadraticCurveTo(cx + sx * 15, cy - 1, cx, cy + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 4; ctx.lineCap = 'round';            // queue
    ctx.beginPath(); ctx.moveTo(cx - d * 10, cy + 4); ctx.quadraticCurveTo(cx - d * 22, cy + 8, cx - d * 24, cy - 2); ctx.stroke();
    ctx.strokeStyle = '#d4674a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - d * 10, cy + 4); ctx.quadraticCurveTo(cx - d * 22, cy + 8, cx - d * 24, cy - 2); ctx.stroke();
    doodleBlob(ctx, cx, cy + 1, 15, 13, '#d4674a');
    ctx.fillStyle = '#f0a07a'; ctx.beginPath(); ctx.ellipse(cx, cy + 6, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
    [-1, 1].forEach(sx => {                                                           // cornes
      ctx.fillStyle = '#f5e6c8'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx + sx * 5, cy - 11); ctx.lineTo(cx + sx * 9, cy - 21); ctx.lineTo(cx + sx * 11, cy - 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    ctx.fillStyle = '#d4674a'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2;        // museau
    ctx.beginPath(); ctx.ellipse(cx + d * 14, cy + 3, 8, 5.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = puff < 3 ? '#ffd54a' : '#ff8c3a';                                 // souffle
    ctx.beginPath(); ctx.arc(cx + d * (23 + puff), cy + 3, 3 + puff * 0.6, 0, Math.PI * 2); ctx.fill();
    doodleEye(ctx, cx + d * 5, cy - 3, 5, d);
    doodleFangs(ctx, cx + d * 13, cy + 7, 10, 2);
  },
  // 👾 Alien — 🌌 Cosmos. Trois yeux et deux antennes : la seule créature à ne pas avoir de
  // symétrie de visage, c'est ce qui la rend franchement étrangère.
  alien(ctx, m, cx, cy, t) {
    const d = m.vx > 0 ? 1 : -1, wig = Math.sin(t * 0.14 + m.x) * 2;
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2; ctx.lineCap = 'round';            // antennes
    [-1, 1].forEach(sx => { ctx.beginPath(); ctx.moveTo(cx + sx * 6, cy - 10); ctx.lineTo(cx + sx * (9 + wig), cy - 19); ctx.stroke(); });
    ctx.fillStyle = '#ffd54a'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.4;
    [-1, 1].forEach(sx => { ctx.beginPath(); ctx.arc(cx + sx * (9 + wig), cy - 20, 2.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    doodleBlob(ctx, cx, cy, 15, 13, '#63c45a');
    ctx.fillStyle = '#8ade7a'; ctx.beginPath(); ctx.ellipse(cx, cy - 4, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    doodleEye(ctx, cx - 6.5, cy - 2, 4.6, d);
    doodleEye(ctx, cx + 6.5, cy - 2, 4.6, d);
    doodleEye(ctx, cx, cy + 5, 3.6, d);                                               // 3e œil, plus bas
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.6;                                 // rictus
    ctx.beginPath(); ctx.moveTo(cx - 6, cy + 10); ctx.lineTo(cx + 6, cy + 10); ctx.stroke();
  },
  // 🛸 Soucoupe — 🌌 Cosmos, très rare. Rayon tracteur sous elle : c'est le seul monstre dont
  // la zone de danger se lit AU-DESSOUS, là où l'on arrive en sautant.
  ufo(ctx, m, cx, cy, t) {
    const blink = Math.floor(t * 0.12) % 3;
    ctx.save();                                                                       // rayon
    ctx.globalAlpha = 0.2 + Math.sin(t * 0.14) * 0.08;
    ctx.fillStyle = '#8fe8ff';
    ctx.beginPath(); ctx.moveTo(cx - 8, cy + 6); ctx.lineTo(cx + 8, cy + 6); ctx.lineTo(cx + 17, cy + 24); ctx.lineTo(cx - 17, cy + 24); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#b8e0ff'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.4;      // dôme
    ctx.beginPath(); ctx.arc(cx, cy - 1, 11, Math.PI, 0); ctx.fill(); ctx.stroke();
    doodleEye(ctx, cx - 4, cy - 6, 3.8, 1);                                           // pilote
    doodleEye(ctx, cx + 4, cy - 6, 3.8, 1);
    ctx.fillStyle = '#8f7fd8'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.4;      // coque
    ctx.beginPath(); ctx.ellipse(cx, cy, 25, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6a5bc0'; ctx.beginPath(); ctx.ellipse(cx, cy + 2, 20, 4, 0, 0, Math.PI * 2); ctx.fill();
    [-14, 0, 14].forEach((dx, i) => {                                                 // feux qui défilent
      ctx.fillStyle = i === blink ? '#ffd54a' : '#3f3568';
      ctx.beginPath(); ctx.arc(cx + dx, cy + 1, 3, 0, Math.PI * 2); ctx.fill();
    });
  },
  // 🪼 Méduse — ombrelle translucide qui se contracte et se détend, et des filaments qui
  // traînent dessous. ⚠ La pulsation est la SEULE animation : une méduse qui garderait une
  // ombrelle figée n'aurait plus rien de vivant, et c'est ce qui la distingue d'une bulle.
  jelly(ctx, m, cx, cy, t) {
    const pu = Math.sin(t * 0.08 + m.x) * 0.16 + 1, rx = 15 * pu, ry = 13 / pu;
    ctx.strokeStyle = '#5fd8e8'; ctx.lineWidth = 2; ctx.lineCap = 'round';            // filaments
    for (let i = -3; i <= 3; i++) {
      const fx = cx + i * 4;
      ctx.beginPath(); ctx.moveTo(fx, cy + ry * 0.6);
      for (let j = 1; j <= 4; j++) ctx.lineTo(fx + Math.sin(t * 0.09 + i + j * 0.9) * 4, cy + ry * 0.6 + j * 5.5);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(150,235,250,0.82)'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - rx, cy);                                          // le bord festonné
    for (let i = 0; i <= 4; i++) ctx.quadraticCurveTo(cx - rx + (i + 0.5) * rx / 2.5, cy + 5, cx - rx + (i + 1) * rx / 2.5, cy);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(cx - 5, cy - 5, 4, 3, -0.5, 0, Math.PI * 2); ctx.fill();
    doodleEye(ctx, cx - 5, cy - 2, 3.6, m.vx > 0 ? 1 : -1);
    doodleEye(ctx, cx + 5, cy - 2, 3.6, m.vx > 0 ? 1 : -1);
  },
  // 🛰️ Drone — petit engin de surveillance : châssis plat, deux rotors qui tournent, et un œil
  // rouge qui BALAIE. ⚠ Le balayage est ce qui le rend menaçant : un drone immobile se serait
  // lu comme un objet du décor.
  drone(ctx, m, cx, cy, t) {
    const bob = Math.sin(t * 0.13 + m.x) * 1.6, look = m.vx > 0 ? 1 : -1;
    ctx.save();
    ctx.strokeStyle = 'rgba(63,232,255,0.55)'; ctx.lineWidth = 1.4;              // les rotors, floutés
    [-1, 1].forEach(sx => {
      ctx.beginPath(); ctx.ellipse(cx + sx * 15, cy - 7 + bob, 9, 2.4 + Math.abs(Math.sin(t * 0.7 + sx)) * 1.6, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#4a5563'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx + sx * 7, cy - 2 + bob); ctx.lineTo(cx + sx * 15, cy - 6 + bob); ctx.stroke();
      ctx.strokeStyle = 'rgba(63,232,255,0.55)'; ctx.lineWidth = 1.4;
    });
    ctx.fillStyle = '#2f3947'; ctx.strokeStyle = '#12161d'; ctx.lineWidth = 2;   // le châssis
    doodleRR(ctx, cx - 12, cy - 5 + bob, 24, 13, 4, '#2f3947'); ctx.stroke();
    ctx.fillStyle = '#ff3fa8';                                                    // le bandeau néon
    ctx.fillRect(cx - 10, cy - 3 + bob, 20, 1.8);
    const scan = Math.sin(t * 0.06) * 8;                                          // l'œil qui balaie
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#e2564a';
    ctx.beginPath(); ctx.moveTo(cx, cy + 6 + bob); ctx.lineTo(cx + scan - 11, cy + 26 + bob); ctx.lineTo(cx + scan + 11, cy + 26 + bob); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = Math.floor(t / 8) % 2 ? '#ffb3ac' : '#e2564a';
    ctx.beginPath(); ctx.arc(cx + look * 2, cy + 4 + bob, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#12161d'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  },
  // 🤖 Mécha — grand automate de combat : torse blindé, visière en fente, deux épaulières et
  // une antenne qui clignote. Très rare, donc massif et lent : c'est sa masse qui fait peur.
  mecha(ctx, m, cx, cy, t) {
    const bob = Math.sin(t * 0.05 + m.x) * 1.4, look = m.vx > 0 ? 1 : -1;
    ctx.save();
    ctx.fillStyle = '#3a4453'; ctx.strokeStyle = '#12161d'; ctx.lineWidth = 2.4;
    [-1, 1].forEach(sx => { doodleRR(ctx, cx + sx * 19 - 7, cy - 12 + bob, 14, 15, 4, '#3a4453'); ctx.stroke(); });   // épaulières
    doodleRR(ctx, cx - 16, cy - 13 + bob, 32, 30, 6, '#4a5563'); ctx.stroke();                                        // torse
    ctx.fillStyle = '#2a323d'; ctx.fillRect(cx - 11, cy + 4 + bob, 22, 9);                                            // ceinture
    ctx.fillStyle = '#b3ff3f'; ctx.globalAlpha = 0.5 + Math.sin(t * 0.1) * 0.4;                                       // réacteur
    ctx.beginPath(); ctx.arc(cx, cy + 8.5 + bob, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    doodleRR(ctx, cx - 12, cy - 24 + bob, 24, 15, 4, '#5a6675'); ctx.strokeStyle = '#12161d'; ctx.stroke();           // tête
    ctx.fillStyle = '#12161d'; ctx.fillRect(cx - 9, cy - 20 + bob, 18, 6);                                            // visière
    ctx.fillStyle = '#ff3fa8';
    ctx.fillRect(cx - 8 + look * 3, cy - 19 + bob, 8, 4);                                                             // le regard, décalé du côté où il va
    ctx.strokeStyle = '#5a6675'; ctx.lineWidth = 2; ctx.lineCap = 'round';                                            // antenne
    ctx.beginPath(); ctx.moveTo(cx + 8, cy - 24 + bob); ctx.lineTo(cx + 13, cy - 34 + bob); ctx.stroke();
    ctx.fillStyle = Math.floor(t / 10) % 2 ? '#e2564a' : '#5a2a26';
    ctx.beginPath(); ctx.arc(cx + 13, cy - 35 + bob, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  // 🦈 Requin — massif, museau pointu, dorsale et gueule ouverte. Très rare, donc il occupe
  // toute la largeur de sa boîte : c'est sa silhouette qu'on doit reconnaître avant le détail.
  shark(ctx, m, cx, cy, t) {
    const look = m.vx > 0 ? 1 : -1, sw = Math.sin(t * 0.13 + m.x) * 3;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(look, 1);
    ctx.fillStyle = '#5b7f96'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.4;
    ctx.beginPath();                                                                   // caudale
    ctx.moveTo(-18, 0); ctx.lineTo(-30 + sw, -13); ctx.lineTo(-25, 0); ctx.lineTo(-30 + sw, 12); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();                                                                   // dorsale
    ctx.moveTo(-2, -9); ctx.lineTo(3, -22); ctx.lineTo(11, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 24, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // corps
    ctx.fillStyle = '#cfdde5'; ctx.beginPath(); ctx.ellipse(-1, 5, 19, 5.5, 0, 0, Math.PI * 2); ctx.fill();   // ventre clair
    ctx.fillStyle = '#5b7f96'; ctx.strokeStyle = '#2b2b33';
    ctx.beginPath(); ctx.moveTo(6, 7); ctx.lineTo(14, 18); ctx.lineTo(16, 6); ctx.closePath(); ctx.fill(); ctx.stroke();   // pectorale
    ctx.fillStyle = '#2b2b33'; ctx.beginPath();                                        // gueule
    ctx.moveTo(12, 4); ctx.quadraticCurveTo(22, 3, 25, 9); ctx.quadraticCurveTo(18, 11, 12, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
    doodleFangs(ctx, cx + look * 18, cy + 5, 12 * look, 3);
    doodleEye(ctx, cx + look * 12, cy - 3, 4, look);
  },
  // 🏗️ Bâtisseur — TRÈS TRÈS TRÈS rare, toutes zones. Casque de chantier, planche sous le
  // bras et niveau à bulle : il annonce ce qu'il fait avant même qu'on lui tire dessus.
  builder(ctx, m, cx, cy, t) {
    const d = m.vx > 0 ? 1 : -1, bob = Math.sin(t * 0.1 + m.x) * 1.5;
    ctx.fillStyle = '#c98b3a'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2;        // planche portée
    ctx.save(); ctx.translate(cx, cy + 10 + bob); ctx.rotate(d * 0.12);
    ctx.beginPath(); ctx.rect(-19, -3, 38, 6); ctx.fill(); ctx.stroke(); ctx.restore();
    doodleBlob(ctx, cx, cy + bob, 15, 13, '#6fb8d8');                                  // corps
    ctx.fillStyle = '#9ad8ef'; ctx.beginPath(); ctx.ellipse(cx, cy + 2 + bob, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb03a'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2;         // casque
    ctx.beginPath(); ctx.arc(cx, cy - 8 + bob, 12, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.rect(cx - 15, cy - 9 + bob, 30, 3.4); ctx.fill(); ctx.stroke();
    doodleEye(ctx, cx - 5, cy - 2 + bob, 4.2, d);
    doodleEye(ctx, cx + 5, cy - 2 + bob, 4.2, d);
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';           // sourire
    ctx.beginPath(); ctx.arc(cx, cy + 5 + bob, 5, 0.25, Math.PI - 0.25); ctx.stroke();
  },
  // 👼 Chérubin — REFAIT DE ZÉRO en 11.5.6 (demande utilisateur), à la grammaire des douze
  // autres créatures : aplats vifs, gros contour sombre à 2,4 px, yeux ronds démesurés,
  // animation lente. Un poupon joufflu en tunique de nuage, ailes battantes et auréole.
  // ⚠ Ailes dessinées AVANT le corps : posées après, elles lui barraient le visage, et une
  // bestiole sans yeux ne se lit plus comme une bestiole.
  // ⚠ L'auréole flotte sur SON propre décalage (`hal`, en retard sur le corps) : c'est ce
  // décalage qui la fait lire comme un anneau posé dans l'air au-dessus de lui, et non comme
  // un chapeau vissé sur son crâne.
  cherub(ctx, m, cx, cy, t) {
    const bob = Math.sin(t * 0.07 + m.x) * 2;
    const hal = Math.sin(t * 0.07 + m.x - 0.9) * 2;
    const fl  = 0.5 + Math.sin(t * 0.2 + m.x) * 0.5;      // battement lent
    const y   = cy + bob;
    [-1, 1].forEach(sx => doodleAngelWing(ctx, cx + sx * 9, y + 5, sx, 19, 13, fl, false, -0.15));
    // La tunique et les deux pieds nus qui dépassent — c'est ce petit corps qui le sépare de
    // l'ancienne version, une tête ailée posée là comme un autocollant.
    doodleBlob(ctx, cx, y + 12, 8.5, 6.5, '#f7fbff');
    ctx.fillStyle = '#ffdcb4'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2;
    [-4.5, 4.5].forEach(dx => { ctx.beginPath(); ctx.ellipse(cx + dx, y + 18, 3.2, 2.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    doodleBlob(ctx, cx, y - 3, 12.5, 11.5, '#ffdcb4');
    // — la frange : un aplat DÉTOURÉ PAR LA TÊTE (clip) puis son bord inférieur retracé à part.
    // ⚠ Sans le clip, la mèche débordait du crâne en deux pointes qui se lisaient comme des
    // CORNES — l'inverse exact de ce qu'on dessine ici.
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, y - 3, 12.5, 11.5, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#f3b45f';
    ctx.beginPath();
    ctx.moveTo(cx - 15, y - 18); ctx.lineTo(cx + 15, y - 18); ctx.lineTo(cx + 15, y - 4.5);
    ctx.quadraticCurveTo(cx + 7, y - 10.5, cx, y - 8.2);
    ctx.quadraticCurveTo(cx - 7, y - 10.5, cx - 15, y - 4.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx - 11.9, y - 6.6);
    ctx.quadraticCurveTo(cx - 7, y - 10.5, cx, y - 8.2);
    ctx.quadraticCurveTo(cx + 7, y - 10.5, cx + 11.9, y - 6.6);
    ctx.stroke();
    // ⚠ La boucle est un VOLUME (deux ellipses pleines) et non un trait refermé : en fine
    // languette elle n'était plus qu'un contour, et se lisait comme une corne.
    ctx.fillStyle = '#f3b45f';
    ctx.beginPath(); ctx.ellipse(cx + 3, cy - 17 + bob, 5.5, 4.5, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx + 7, cy - 20 + bob, 3.4, 3, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(238,116,116,0.5)';                                       // les joues
    [-8.5, 8.5].forEach(dx => { ctx.beginPath(); ctx.ellipse(cx + dx, y + 1, 3.8, 2.7, 0, 0, Math.PI * 2); ctx.fill(); });
    doodleEye(ctx, cx - 4.8, y - 3.5, 4.4, 0);
    doodleEye(ctx, cx + 4.8, y - 3.5, 4.4, 0);
    ctx.fillStyle = '#2b2b33';                                                     // la bouche ronde
    ctx.beginPath(); ctx.ellipse(cx, y + 4.5, 2.5, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    doodleHalo(ctx, cx, cy - 21 + hal, 9.5, false);
  },
  // 😇 Séraphin — REFAIT DE ZÉRO en 11.5.6 (demande utilisateur) : l'ancien était un
  // autocollant pastel (trait bleu clair de 1,5 px, petits yeux, ailes en ellipses détachées)
  // qui jurait avec les douze autres créatures. Même grammaire que le chérubin, dont il reprend
  // le plumage et l'anneau, mais TROIS PAIRES d'ailes, une robe longue et une auréole à éclats.
  // ⚠ Dessiné plus HAUT que large, robe comprise : c'est ce qui le distingue au premier coup
  // d'œil du 👼 Chérubin, dont il partage les couleurs.
  // ⚠ Les trois paires battent DÉPHASÉES : au même instant, elles se lisaient comme une seule
  // aile épaisse recopiée trois fois.
  // ⚠ Paires dessinées de bas en haut, corps par-dessus : c'est l'ordre qui donne l'étagement.
  seraph(ctx, m, cx, cy, t) {
    const bob = Math.sin(t * 0.055 + m.x) * 2.4;
    const hal = Math.sin(t * 0.055 + m.x - 1) * 2.4;
    const y   = cy + bob;
    // ⚠ Or réservé à la GRANDE paire : six pointes dorées faisaient une grappe de taches et
    // on ne lisait plus l'aile du tout.
    [[8, 14, 16, 12, 1.4, 0.42, false], [11, 2, 24, 16, 0.7, -0.02, true], [9, -6, 18, 13, 0, -0.46, false]].forEach(([dx, dy, len, ht, ph, tilt, tip]) => {
      const fl = 0.5 + Math.sin(t * 0.16 + m.x + ph) * 0.5;
      [-1, 1].forEach(sx => doodleAngelWing(ctx, cx + sx * dx, y + dy, sx, len, ht, fl, tip, tilt));
    });
    // La robe : évasée vers le bas, ourlet dans l'ombre bleutée des cumulus, ceinture dorée.
    ctx.fillStyle = '#f7fbff'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 8, y - 3); ctx.lineTo(cx - 13, y + 15);
    ctx.quadraticCurveTo(cx, y + 22, cx + 13, y + 15);
    ctx.lineTo(cx + 8, y - 3); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(126,168,214,0.35)'; ctx.fillRect(cx - 16, y + 10, 32, 14);
    ctx.restore();
    ctx.fillStyle = '#ffd54a'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.rect(cx - 9.5, y - 1, 19, 4.5); ctx.fill(); ctx.stroke();
    doodleBlob(ctx, cx, y - 13, 11, 10, '#ffe3c8');
    // Frange BOL, à plat : celle du chérubin ondule et porte une boucle, celle-ci est coupée
    // net — deux têtes blondes qu'on doit pouvoir séparer d'un coup d'œil.
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, y - 13, 11, 10, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#f7d38a'; ctx.fillRect(cx - 13, y - 25, 26, 10.5);
    ctx.restore();
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(cx - 10.4, y - 17.5); ctx.lineTo(cx + 10.4, y - 17.5); ctx.stroke();
    ctx.fillStyle = 'rgba(238,116,116,0.45)';
    [-7.5, 7.5].forEach(dx => { ctx.beginPath(); ctx.ellipse(cx + dx, y - 9.5, 3.2, 2.2, 0, 0, Math.PI * 2); ctx.fill(); });
    doodleEye(ctx, cx - 4.2, y - 13, 4.2, 0);
    doodleEye(ctx, cx + 4.2, y - 13, 4.2, 0);
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';        // le sourire serein
    ctx.beginPath(); ctx.arc(cx, y - 7, 4, 0.3, Math.PI - 0.3); ctx.stroke();
    doodleHalo(ctx, cx, cy - 26 + hal, 13, true);
  },
  // 🌈 Monstre arc-en-ciel — descendu du ciel à l'ouverture d'un coffre d'🌈 Arc-en-ciel. Une
  // CHEVELURE aux six couleurs, une mèche par couleur, qui ondule en tombant de part et d'autre
  // du crâne ; les points de vie qui lui RESTENT se comptent en pastilles sous lui, seul moyen de
  // savoir combien de balles il faut encore — et il en faut plusieurs.
  // ⚠ Les mèches sont dessinées AVANT la tête et en partent : posées après, elles lui auraient
  // barré le visage, et une bestiole sans yeux ne se lit plus comme une bestiole.
  // ⚠ L'ondulation est indexée sur `m.x` autant que sur `t` : sans elle, deux monstres à l'écran
  // auraient agité leurs cheveux au même instant, exactement comme un seul dessin recopié.
  rbmob(ctx, m, cx, cy, t) {
    const bob = Math.sin(t * 0.1 + m.x) * 1.6, ty2 = cy + bob;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    D_RAINBOW_COLS.forEach((col, i) => {
      const n = D_RAINBOW_COLS.length;
      const side = i < n / 2 ? -1 : 1;                                // moitié des mèches à gauche, moitié à droite
      const k = (i % (n / 2)) / Math.max(1, n / 2 - 1);               // 0 = près du crâne, 1 = mèche extérieure
      const rx = side * (5 + k * 9), len = 16 + (1 - k) * 8;
      ctx.strokeStyle = col; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(cx + rx * 0.3, ty2 - 10);
      ctx.quadraticCurveTo(cx + rx * 1.5, ty2 - 4 + Math.sin(t * 0.07 + i + m.x) * 2,
                           cx + rx * 1.25, ty2 - 10 + len + Math.sin(t * 0.09 + i * 1.7 + m.x) * 2.5);
      ctx.stroke();
    });
    doodleBlob(ctx, cx, cy + bob, 14, 12, '#fdf6ff');
    // … et la frange, six bandes peintes sur le haut du crâne. ⚠ DÉTOURÉES par la tête
    // (`clip`) : des rectangles posés à cru auraient débordé de l'ovale par les coins, et la
    // chevelure se serait lue comme une casquette.
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, ty2, 14, 12, 0, 0, Math.PI * 2); ctx.clip();
    const bw2 = 30 / D_RAINBOW_COLS.length;
    D_RAINBOW_COLS.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(cx - 15 + i * bw2, ty2 - 13, bw2 + 0.6, 7.5); });
    ctx.restore();
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.4;                 // le trait de la tête, remis PAR-DESSUS la frange
    ctx.beginPath(); ctx.ellipse(cx, ty2, 14, 12, 0, 0, Math.PI * 2); ctx.stroke();
    doodleEye(ctx, cx - 5, cy - 1 + bob, 4, 0);
    doodleEye(ctx, cx + 5, cy - 1 + bob, 4, 0);
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx, cy + 5 + bob, 4.5, 0.25, Math.PI - 0.25); ctx.stroke();
    ctx.fillStyle = '#2b2b33';
    const hp = m.hp || 0;
    for (let i = 0; i < hp; i++) { ctx.beginPath(); ctx.arc(cx + (i - (hp - 1) / 2) * 6, cy + 15 + bob, 2, 0, Math.PI * 2); ctx.fill(); }
  },
};
function doodleMonster(ctx, m, t) {
  const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
  const draw = D_MOB_DRAW[m.kind];
  if (draw) {
    // Très rare : auréole pulsée, on doit la voir venir de loin. Posée SOUS la créature.
    if (m.rare) {
      ctx.save(); ctx.globalAlpha = 0.28 + Math.sin(t * 0.18) * 0.16;
      ctx.fillStyle = '#e2564a'; ctx.beginPath(); ctx.arc(cx, cy, m.w * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // ⚠ save/restore CENTRALISÉ : chaque entrée de la table change lineWidth, lineCap et
    // fillStyle sans les remettre — sans ce garde-fou, la première bestiole dessinée
    // repeindrait toutes les suivantes.
    ctx.save(); draw(ctx, m, cx, cy, t); ctx.restore();
    return;
  }
  // ⚠ Repli ÉMOJI : plus aucune créature du jeu ne passe par là (les dix sont dessinées), mais
  // il reste le filet d'une bestiole ajoutée à D_BIOMES sans son dessin — mieux vaut un émoji
  // qu'un monstre invisible, donc mortel sans prévenir.
  if (m.kind) {
    const bob = Math.sin(t * 0.11 + m.x) * 2;
    ctx.save();
    ctx.font = `${Math.round(m.h * 0.92)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.icon || '❓', cx, cy + bob);
    ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    return;
  }
  if (m.type === 2) {   // OVNI
    ctx.fillStyle = '#8a7bd8'; ctx.beginPath(); ctx.ellipse(cx, cy + 4, 22, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b8e0ff'; ctx.beginPath(); ctx.arc(cx, cy, 10, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#5a4bb0'; [-12, 0, 12].forEach(dx => { ctx.beginPath(); ctx.arc(cx + dx, cy + 4, 2.5, 0, Math.PI * 2); ctx.fill(); });
    return;
  }
  const col = m.type === 0 ? '#7b4bd0' : '#d04b7b';
  ctx.fillStyle = col;
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 13); ctx.lineTo(cx + Math.cos(a) * 23, cy + Math.sin(a) * 20); ctx.lineTo(cx + Math.cos(a + 0.32) * 15, cy + Math.sin(a + 0.32) * 13); ctx.closePath(); ctx.fill(); }
  ctx.strokeStyle = '#0003'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, 17, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; [-6, 6].forEach(dx => { ctx.beginPath(); ctx.arc(cx + dx, cy - 2, 4.2, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#111'; [-6, 6].forEach(dx => { ctx.beginPath(); ctx.arc(cx + dx, cy - 1, 2.1, 0, Math.PI * 2); ctx.fill(); });
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy + 6, 4, 0, Math.PI); ctx.stroke();
}

// Coffre au butin. Il flotte légèrement une fois posé (repère visuel : ce qui bouge s'attrape),
// et garde une ombre portée tant qu'il tombe pour qu'on anticipe où il va se poser.
function doodleChest(ctx, c, t) {
  const bob = c.landed ? Math.sin(t * 0.13) * 1.4 : 0;
  const x = c.x, y = c.y + bob, w = c.w, h = c.h;
  doodleRR(ctx, x, y, w, h, 4, '#8a5a2c');
  ctx.fillStyle = '#b9793a'; ctx.fillRect(x + 2, y + 2, w - 4, h * 0.42);
  ctx.fillStyle = '#6b4420'; ctx.fillRect(x, y + h * 0.46, w, 3);
  ctx.fillStyle = '#ffd54a'; ctx.fillRect(x + w / 2 - 3, y + h * 0.34, 6, 7);          // fermoir doré
  ctx.strokeStyle = '#5b3a1c'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
  if (!c.landed) { ctx.globalAlpha = 0.18; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 7, w * 0.42, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
}
function doodleItem(ctx, it, t) {
  const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
  if (it.type === 'jet') {
    ctx.fillStyle = '#9aa3ad'; ctx.fillRect(cx - 8, cy - 8, 16, 16);
    ctx.fillStyle = '#6b727b'; ctx.fillRect(cx - 8, cy - 8, 16, 4);
    ctx.fillStyle = '#f5a623'; ctx.beginPath(); ctx.moveTo(cx - 6, cy + 8); ctx.lineTo(cx + 6, cy + 8); ctx.lineTo(cx, cy + 15); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = '#e24a4a'; ctx.beginPath(); ctx.arc(cx, cy + 3, 8, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#8a2a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy - 9); ctx.stroke();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2.5; const a = t * 0.5;
    ctx.beginPath(); ctx.moveTo(cx - 9 * Math.cos(a), cy - 9 + 3 * Math.sin(a)); ctx.lineTo(cx + 9 * Math.cos(a), cy - 9 - 3 * Math.sin(a)); ctx.stroke();
  }
}
function doodleHole(ctx, h, t) {
  const g = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, h.r);
  g.addColorStop(0, '#000'); g.addColorStop(0.7, '#2a1a4a'); g.addColorStop(1, 'rgba(60,40,90,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6a4bb0'; ctx.lineWidth = 1.6; ctx.beginPath();
  for (let a = 0; a < Math.PI * 4; a += 0.3) { const rr = 2 + a * 2.2; ctx.lineTo(h.x + Math.cos(a + t * 0.05) * rr, h.y + Math.sin(a + t * 0.05) * rr); } ctx.stroke();
}
// ⚠ `pal` : la palette du corps, pour que les 👥 clones réutilisent EXACTEMENT ce dessin. Une
// seconde fonction « doodler mais en bleu » aurait divergé du vrai dès la première retouche.
function doodleDoodler(ctx, x, y, face, fly, t, pal) {
  const P = pal || { body:'#7ac043', dark:'#3f7a24', eye:'#2f5e18' };
  ctx.save(); ctx.translate(x, y);
  const dir = face === -1 ? -1 : 1;   // face 0 = tir vers le haut
  if (fly === 'jet') {
    ctx.fillStyle = '#9aa3ad'; ctx.fillRect(-20, -4, 9, 20); ctx.fillStyle = '#6b727b'; ctx.fillRect(-20, -4, 9, 5);
    ctx.fillStyle = '#f5a623'; const fl = 6 + Math.random() * 7; ctx.beginPath(); ctx.moveTo(-20, 16); ctx.lineTo(-11, 16); ctx.lineTo(-15.5, 16 + fl); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = P.dark; [-8, 8].forEach(fx => { ctx.beginPath(); ctx.ellipse(fx, 15, 5, 4, 0, 0, Math.PI * 2); ctx.fill(); });   // pattes
  ctx.fillStyle = P.body; ctx.strokeStyle = P.dark; ctx.lineWidth = 2;                                                             // corps
  ctx.beginPath(); ctx.ellipse(0, 2, 16, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (face === 0) {   // museau vers le haut (tir)
    ctx.fillStyle = P.body; ctx.beginPath(); ctx.moveTo(-6, -8); ctx.quadraticCurveTo(0, -26, 6, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.eye; ctx.beginPath(); ctx.arc(-2, -20, 1.5, 0, Math.PI * 2); ctx.arc(2, -20, 1.5, 0, Math.PI * 2); ctx.fill();
  } else {            // museau sur le côté (sens du déplacement)
    ctx.fillStyle = P.body; ctx.beginPath(); ctx.moveTo(6 * dir, -4); ctx.quadraticCurveTo(25 * dir, -2, 22 * dir, 7); ctx.quadraticCurveTo(14 * dir, 8, 6 * dir, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.eye; ctx.beginPath(); ctx.arc(19 * dir, 3, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#fff'; ctx.strokeStyle = P.dark; ctx.lineWidth = 1.4;                                                          // yeux
  [-6, 6].forEach(ex => { ctx.beginPath(); ctx.arc(ex, -8, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
  const pp = face === 0 ? 0 : dir * 1.6; ctx.fillStyle = '#222';
  [-6, 6].forEach(ex => { ctx.beginPath(); ctx.arc(ex + pp, -8, 2.2, 0, Math.PI * 2); ctx.fill(); });
  if (fly === 'balloon') {
    ctx.strokeStyle = '#8a2a2a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(2, -25); ctx.stroke();
    ctx.fillStyle = '#e2564a'; ctx.strokeStyle = '#8a2a2a'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.ellipse(2, -37, 12, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-2, -42, 3.4, 5, -0.4, 0, Math.PI * 2); ctx.fill();
  }
  // 🫧 Bulle : sphère translucide AUTOUR du doodler, avec son reflet et son liseré irisé. Elle
  // ondule légèrement — une sphère parfaitement immobile aurait eu l'air d'un simple cercle.
  if (fly === 'bubble') {
    const rx = 25 + Math.sin(t * 0.14) * 1.6, ry = 27 - Math.sin(t * 0.14) * 1.6;
    ctx.save();
    ctx.fillStyle = 'rgba(191,234,248,0.28)';
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(143,216,245,0.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, rx - 3, ry - 3, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(-rx * 0.45, -ry * 0.45, 4.5, 6.5, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  if (fly === 'prop') {
    ctx.fillStyle = '#e24a4a'; ctx.beginPath(); ctx.arc(0, -16, 8, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#8a2a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, -28); ctx.stroke();
    const a = t * 0.7; ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-11 * Math.cos(a), -28 + 4 * Math.sin(a)); ctx.lineTo(11 * Math.cos(a), -28 - 4 * Math.sin(a)); ctx.stroke();
  }
  ctx.restore();
}
// ⚠ 9.7.7 — LES BOUCLIERS SE PORTENT AUTOUR DU HÉROS (demande utilisateur). Ils n'existaient
// qu'en pastilles dans le coin du HUD, à l'opposé du regard — qui, lui, ne quitte jamais le
// doodler. Le ⏳ temporel devient une bulle qui l'enveloppe ; les boucliers à CHARGES gravitent
// autour de lui, un satellite par charge, si bien que leur nombre se lit sans rien compter.
// ⚠ Les pastilles du HUD restent : elles seules donnent les POINTS qui restent au temporel.
// ⚠ La 🛡️ Carapace (bonus permanent) et le 🛡️ Bouclier (butin de coffre) partagent la même
// icône : c'est le FOND du satellite qui les distingue — ambre pour la carapace, blanc pour le
// bouclier. Deux jeux d'orbes identiques auraient menti sur ce qui protège vraiment.
const D_SHORB_R = 28, D_SHORB_SPD = 0.03, D_SHORB_FLAT = 0.6;
// 🐏 Le bouclier du Bélier. ⚠ Il ne se montre QUE pendant la montée (`s.vy < 0`) : c'est le
// seul moment où il garde, l'afficher en permanence aurait promis une protection qui n'existe pas.
// ⚠ `s.vy` et non l'état d'un saut : tout ce qui soulève (ressort, geyser, jetpack, arbre)
// compte, exactement comme la demande le dit — « dès que le doodler va vers le haut ».
// ⚠ 11.6.3 — UN SEUL TRAIT, À DEUX POINTES (demande utilisateur). Le dôme empilait jusqu'à
// trois arcs concentriques, un par charge : de loin ça se lisait comme un halo flou, et les
// deux cornes enroulées de ses extrémités épaississaient encore la silhouette. Il ne reste que
// l'arc CENTRAL, dessiné comme un croissant PLEIN dont l'épaisseur s'annule aux deux bouts —
// d'où deux pointes franches, qui disent à elles seules dans quel sens la charge pousse.
// ⚠ C'est donc un `fill` et non un `stroke` : un trait d'épaisseur constante ne peut pas finir
// en pointe, quel que soit son `lineCap`. Les deux courbes (extérieure et intérieure) se
// rejoignent exactement là où la demi-épaisseur vaut 0.
// ⚠ Le nombre de charges n'est plus porté par le dessin : c'est la pastille du HUD qui le donne,
// comme elle le faisait déjà au-delà de trois.
// ⚠ Le dôme est calé AU-DESSUS de la tête (centre à `py - D_RAM_UP`, rayon D_RAM_R) : posé plus
// bas, ses pointes traversaient le crâne et le bouclier se lisait comme un chapeau.
// ⚠ Le croissant est DOUBLÉ d'un liseré sombre — le gros contour de tout le jeu : la couleur
// claire seule disparaissait sur le fond crème des premiers biomes. Le liseré est tracé en
// `miter` pour que les pointes restent franches ; en `round` elles se seraient arrondies.
const D_RAM_R = 24, D_RAM_UP = 10, D_RAM_TH = 4.2, D_RAM_STEP = 28;
function doodleRamGuard(ctx, s) {
  const n = s.wpn ? (s.wpn.shRam || 0) : 0;
  if (n <= 0 || !(s.vy < 0)) return;
  const puls = 1 + Math.sin(s.t * 0.22) * 0.06, cy = s.py - D_RAM_UP, r = D_RAM_R * puls;
  const a0 = Math.PI * 1.13, a1 = Math.PI * 1.87;
  // Demi-épaisseur en cloche : maximale au milieu de l'arc, nulle aux deux extrémités.
  const th = k => Math.sin(Math.PI * k) * D_RAM_TH * puls;
  const path = () => {
    ctx.beginPath();
    for (let i = 0; i <= D_RAM_STEP; i++) {
      const k = i / D_RAM_STEP, a = a0 + (a1 - a0) * k, rr = r + th(k);
      const x = s.px + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    for (let i = D_RAM_STEP; i >= 0; i--) {
      const k = i / D_RAM_STEP, a = a0 + (a1 - a0) * k, rr = r - th(k);
      ctx.lineTo(s.px + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
  };
  ctx.save();
  // Voile chaud sous le croissant : il rattache le bouclier à la tête au lieu de le laisser flotter.
  const g = ctx.createLinearGradient(0, cy - r, 0, cy);
  g.addColorStop(0, 'rgba(255,214,140,0.34)'); g.addColorStop(1, 'rgba(255,214,140,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(s.px, cy, r, a0, a1); ctx.closePath(); ctx.fill();
  ctx.lineJoin = 'miter'; ctx.miterLimit = 12; ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(74,44,14,0.55)'; ctx.lineWidth = 1.8; path(); ctx.stroke();
  ctx.fillStyle = '#ffe2a8'; path(); ctx.fill();
  ctx.restore();
}
function doodleShieldAura(ctx, s) {
  doodleRamGuard(ctx, s);   // 🐏 AVANT le garde-fou ci-dessous : sans ça, un joueur qui ne porte QUE des béliers ne verrait rien
  const orbs = [];
  for (let i = 0; i < (s.wpn ? s.wpn.shHit : 0); i++) orbs.push({ ic:'🛡️', bg:'rgba(255,255,255,0.94)' });
  for (let i = 0; i < (s.armorLeft || 0); i++) orbs.push({ ic:'🛡️', bg:'rgba(255,213,74,0.94)' });
  for (let i = 0; i < (s.wpn ? s.wpn.shFall : 0); i++) orbs.push({ ic:'🪂', bg:'rgba(255,255,255,0.94)' });
  for (let i = 0; i < (s.wpn ? s.wpn.shVoid || 0 : 0); i++) orbs.push({ ic:'🌌', bg:'rgba(58,42,107,0.94)' });   // 🌌 fond SOMBRE : c'est le seul satellite qui protège d'un trou noir, il doit se lire comme tel
  if (!orbs.length && !(s.shTimeLeft > 0)) return;
  ctx.save();
  // ⏳ La bulle RESPIRE (rayon oscillant) : fixe, elle se serait confondue avec le halo doré de
  // l'invulnérabilité, qui est justement ce que le bouclier temporel déclenche à chaque coup.
  if (s.shTimeLeft > 0) {
    const r = 26 + Math.sin(s.t * 0.09) * 2;
    const g = ctx.createRadialGradient(s.px, s.py, r * 0.55, s.px, s.py, r);
    g.addColorStop(0, 'rgba(90,190,255,0)'); g.addColorStop(1, 'rgba(90,190,255,0.32)');   // ⚠ centre TRANSPARENT : la bulle est dessinée par-dessus le doodler, elle ne doit pas le voiler
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.px, s.py, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(150,225,255,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.px, s.py, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  orbs.forEach((o, i) => {
    const a = s.t * D_SHORB_SPD + (i / orbs.length) * Math.PI * 2;
    const ox = s.px + Math.cos(a) * D_SHORB_R, oy = s.py + Math.sin(a) * D_SHORB_R * D_SHORB_FLAT;   // orbite APLATIE : elle se lit comme un tour autour du doodler, pas comme un cercle plat
    ctx.globalAlpha = 0.55 + 0.45 * ((Math.sin(a) + 1) / 2);                                          // … et le satellite qui passe derrière s'estompe
    ctx.fillStyle = o.bg; ctx.beginPath(); ctx.arc(ox, oy, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillText(o.ic, ox, oy + 0.5);
  });
  ctx.restore();
}
// Les trois monstres. Même grammaire que les créatures du jeu (aplats vifs, gros contour
// sombre) mais à une tout autre échelle, et chacun avec sa silhouette : un ver segmenté, une
// gueule de mâchoires, un œil unique. `tel` = 0..1, l'annonce de l'attaque en cours : le
// monstre se gonfle et rougeoie juste avant de frapper, c'est le seul avertissement.
const D_BOSS_DRAW = {
  ver(ctx, k, cx, cy, t, tel) {
    const seg = 5;
    for (let i = seg - 1; i >= 0; i--) {                                  // anneaux du corps
      const f = i / (seg - 1), sx = cx + Math.sin(t * 0.05 + i * 0.8) * 16 * f;
      doodleBlob(ctx, sx, cy + 8 + i * 9, 30 - i * 4.5, 15 - i * 2, i % 2 ? k.dark : k.body);
    }
    doodleBlob(ctx, cx, cy - 6, 34, 26, k.body);
    ctx.fillStyle = k.dark;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(cx - 22 + i * 11, cy - 22, 3.4, 6, 0, 0, Math.PI * 2); ctx.fill(); }
    doodleEye(ctx, cx - 12, cy - 6, 8, 0);
    doodleEye(ctx, cx + 12, cy - 6, 8, 0);
    ctx.fillStyle = '#2b2b33'; ctx.beginPath(); ctx.ellipse(cx, cy + 12, 13 + tel * 6, 7 + tel * 4, 0, 0, Math.PI * 2); ctx.fill();
    doodleFangs(ctx, cx, cy + 6, 22, 5);
  },
  gueule(ctx, k, cx, cy, t, tel) {
    const gap = 12 + tel * 16 + Math.sin(t * 0.06) * 3;                    // les mâchoires s'ouvrent avant de cracher
    ctx.fillStyle = '#1a0a0c';                                             // gorge
    ctx.beginPath(); ctx.ellipse(cx, cy, 40, 30, 0, 0, Math.PI * 2); ctx.fill();
    [-1, 1].forEach(sy => {                                                // mâchoires
      ctx.fillStyle = sy < 0 ? k.body : k.dark; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(cx - 46, cy + sy * gap);
      ctx.quadraticCurveTo(cx, cy + sy * (gap + 34), cx + 46, cy + sy * gap);
      ctx.quadraticCurveTo(cx, cy + sy * (gap + 12), cx - 46, cy + sy * gap);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f2f4f7'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 7; i++) {                                        // crocs
        const tx = cx - 36 + i * 12, ty = cy + sy * (gap + 2);
        ctx.beginPath(); ctx.moveTo(tx - 5, ty); ctx.lineTo(tx, ty + sy * 13); ctx.lineTo(tx + 5, ty); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    });
    ctx.fillStyle = k.eye;                                                 // braises au fond de la gorge
    for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.4 + Math.sin(t * 0.12 + i) * 0.4; ctx.beginPath(); ctx.arc(cx - 16 + i * 16, cy, 4 + tel * 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  },
  oeil(ctx, k, cx, cy, t, tel) {
    for (let i = 0; i < 8; i++) {                                          // tentacules d'ancrage
      const a = Math.PI + i / 7 * Math.PI, r = 40 + Math.sin(t * 0.07 + i) * 5;
      ctx.strokeStyle = k.dark; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7 + 12, cx + Math.cos(a) * r, cy + Math.sin(a) * r + 22); ctx.stroke();
    }
    doodleBlob(ctx, cx, cy, 40, 34, k.body);
    ctx.fillStyle = k.eye; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.ellipse(cx, cy, 26 - tel * 4, 22 - tel * 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8a1f2a'; ctx.beginPath(); ctx.ellipse(cx, cy, 14 + tel * 6, 12 + tel * 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#15151c'; ctx.beginPath(); ctx.ellipse(cx, cy, 6 + tel * 4, 11 - tel * 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a1f2a'; ctx.lineWidth = 1.6;                      // veines
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + t * 0.01;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 22); ctx.lineTo(cx + Math.cos(a) * 38, cy + Math.sin(a) * 32); ctx.stroke();
    }
  },
};
// Le boss, ses attaques et sa barre de vie. ⚠ Tout est dessiné APRÈS le plancher et le
// doodler : dans une arène, ce qui tue doit toujours passer devant ce qui décore.
function doodleBossDraw(ctx, s, W, H) {
  // Piques du plancher : elles sortent progressivement, un liseré rouge annonce la sortie.
  for (const sp of s.bossSpikes || []) {
    // Annonce : liseré au sol + contour en pointillé des trois pointes à VENIR, exactement là
    // où elles sortiront. Le clignotement ACCÉLÈRE à mesure que l'échéance approche — un
    // clignotement régulier ne dit pas combien de temps il reste.
    if (sp.warn > 0) {
      const k = 1 - sp.warn / D_BOSS_SPIKE_WARN;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(sp.warn * (0.06 + k * 0.14)));
      ctx.fillStyle = '#e2564a';
      ctx.fillRect(sp.x - D_BOSS_SPIKE_W / 2 - 4, s.bossFloorY - 3, D_BOSS_SPIKE_W + 8, 3);
      ctx.strokeStyle = '#8e2b2b'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]);
      for (let i = -1; i <= 1; i++) {
        const bx = sp.x + i * 9;
        ctx.beginPath(); ctx.moveTo(bx - 5, s.bossFloorY); ctx.lineTo(bx, s.bossFloorY - D_BOSS_SPIKE_UP * 0.75); ctx.lineTo(bx + 5, s.bossFloorY); ctx.closePath(); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
      continue;
    }
    const up = (sp.up || 0) * D_BOSS_SPIKE_UP;
    ctx.fillStyle = '#f2f4f7'; ctx.strokeStyle = '#8e2b2b'; ctx.lineWidth = 1.6;
    for (let i = -1; i <= 1; i++) {
      const bx = sp.x + i * 9;
      ctx.beginPath(); ctx.moveTo(bx - 5, s.bossFloorY); ctx.lineTo(bx, s.bossFloorY - up); ctx.lineTo(bx + 5, s.bossFloorY); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  // Rayon balayant : colonne pleine hauteur, cœur clair et halo.
  if (s.bossBeam) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,90,90,0.28)'; ctx.fillRect(s.bossBeam.x - D_BOSS_BEAM_W, 0, D_BOSS_BEAM_W * 2, H);
    ctx.fillStyle = 'rgba(255,220,220,0.85)'; ctx.fillRect(s.bossBeam.x - D_BOSS_BEAM_W / 4, 0, D_BOSS_BEAM_W / 2, H);
    ctx.restore();
  }
  for (const sh of s.bossShots || []) {
    ctx.fillStyle = 'rgba(226,86,74,0.35)'; ctx.beginPath(); ctx.arc(sh.x, sh.y, D_BOSS_SHOT_R * 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e2564a'; ctx.strokeStyle = '#5f1b21'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(sh.x, sh.y, D_BOSS_SHOT_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(sh.x - 1.5, sh.y - 1.5, D_BOSS_SHOT_R * 0.36, 0, Math.PI * 2); ctx.fill();
  }
  const b = s.boss;
  if (!b) return;
  const kind = doodleBossKind(s), tel = b.tel > 0 ? 1 - b.tel / D_BOSS_TEL : 0;
  ctx.save();
  if (b.hurt > 0 && Math.floor(b.hurt / 3) % 2) ctx.globalAlpha = 0.45;   // clignotement de dégât
  const draw = D_BOSS_DRAW[b.kind] || D_BOSS_DRAW.ver;
  draw(ctx, kind, b.x, D_BOSS_Y, s.t, tel);
  ctx.restore();
  // 🛡️ Le bouclier : une bulle hexagonale qui enveloppe le boss, d'autant plus dense qu'il lui
  // reste de charges, et qui encaisse le coup en blanchissant. ⚠ Dessinée APRÈS le corps (il
  // l'aurait masquée) et AVANT la barre de vie, qui doit rester au premier plan.
  if (b.sh > 0) {
    const fl = Math.max(0, (b.shHit || 0) / D_BOSS_SH_FLASH);
    const rx = D_BOSS_W / 2 + 10, ry = D_BOSS_H / 2 + 12;
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 3, hx = b.x + Math.cos(a) * rx, hy = D_BOSS_Y + Math.sin(a) * ry;
      if (i) ctx.lineTo(hx, hy); else ctx.moveTo(hx, hy);
    }
    ctx.closePath();
    ctx.globalAlpha = Math.min(0.9, 0.13 + 0.1 * b.sh + fl * 0.45 + Math.sin(s.t * 0.08) * 0.04);
    ctx.fillStyle = '#8fd4ff'; ctx.fill();
    ctx.globalAlpha = Math.min(1, 0.7 + fl * 0.3);
    ctx.strokeStyle = '#dff2ff'; ctx.lineWidth = 2 + fl * 3; ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🛡️'.repeat(b.sh), b.x, D_BOSS_Y - ry - 7);
    ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  // Barre de vie : elle est le seul repère de progression du combat.
  const bw = W - 40;
  doodleRR(ctx, 20, 12, bw, 12, 6, 'rgba(30,32,40,0.72)');
  const hpMax = b.hpMax || D_BOSS_HP;
  doodleRR(ctx, 22, 14, (bw - 4) * Math.max(0, b.hp) / hpMax, 8, 4, b.hp > hpMax * 0.3 ? '#e2564a' : '#ffd54a');
  ctx.save(); ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff'; ctx.fillText(`💀 ${kind.name} · ${Math.max(0, b.hp)} / ${hpMax}${b.sh > 0 ? ' · 🛡️×' + b.sh : ''}`, W / 2, 18.5);
  ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
// 🔔 Fausse notification : carte qui GLISSE depuis le haut puis repart, ou barre de volume qui
// descend sur le bord droit. ⚠ Dessinée avec le HUD, donc à l'endroit et jamais inversée : elle
// imite l'interface du téléphone, pas le monde du jeu.
function doodleNotif(ctx, s, W, H) {
  const n = s.notif; if (!n) return;
  const k = 1 - n.life / D_NOTIF_LIFE;
  const slide = Math.min(1, Math.min(k, 1 - k) * 8);   // entrée et sortie glissées, plateau au milieu
  if (n.vol) {
    // Barre de volume : elle descend pendant toute la durée, comme quand on baisse le son.
    const bh = 132, bx = W - 20, by = (H - bh) / 2, v = Math.max(0, 1 - k * 1.15);
    ctx.save(); ctx.globalAlpha = slide;
    ctx.translate((1 - slide) * 26, 0);
    doodleRR(ctx, bx - 6, by - 26, 18, bh + 34, 9, 'rgba(24,26,32,0.82)');
    doodleRR(ctx, bx - 2, by, 10, bh, 5, 'rgba(255,255,255,0.22)');
    doodleRR(ctx, bx - 2, by + bh * (1 - v), 10, bh * v, 5, '#ffffff');
    ctx.save(); ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(v > 0.02 ? '🔉' : '🔇', bx + 3, by - 14);
    ctx.restore();
    ctx.restore();
    return;
  }
  const cw = Math.min(W - 24, 250), cx = (W - cw) / 2, ch = 46, cy = 30 - (1 - slide) * 46;
  ctx.save(); ctx.globalAlpha = slide;
  doodleRR(ctx, cx, cy, cw, ch, 11, 'rgba(24,26,32,0.9)');
  doodleRR(ctx, cx + 7, cy + 9, 28, 28, 8, 'rgba(255,255,255,0.14)');
  ctx.save(); ctx.font = '17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.fillText(n.icon, cx + 21, cy + 23);
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(n.ti, cx + 43, cy + 16);
  ctx.font = '10px sans-serif'; ctx.fillStyle = '#c9ced6';
  ctx.fillText(n.bo.length > 34 ? n.bo.slice(0, 33) + '…' : n.bo, cx + 43, cy + 31);
  ctx.restore();
  ctx.restore();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
function doodleDraw(ctx, s, W, H) {
  // 🍄 Champignon : tout le MONDE ondule (décor compris), le HUD non — d'où le `restore` posé
  // juste avant lui, et non en fin de fonction.
  // 🔍 Le zoom se fond dans LA MÊME transformation que l'ondulation du 🍄 Champignon : deux
  // save/restore imbriqués, et il aurait suffi d'un `return` au milieu du dessin pour laisser
  // la pile déséquilibrée et tout décaler à la frame suivante.
  const sw = doodleShroomWarp(s), zm = s.zoom || 1;
  const warped = !!sw || Math.abs(zm - 1) > 0.0005;
  if (warped) {
    // ⚠ Dézoomé, le monde ne remplit plus le cadre : on peint d'abord toute la toile de la
    // couleur du papier, sinon la bordure garderait l'image de la frame précédente.
    if (zm < 1) { ctx.fillStyle = doodleBiomeCols(s, s.score).paper; ctx.fillRect(0, 0, W, H); }
    const sc = zm * (sw ? sw.sc : 1);
    ctx.save();
    ctx.translate(W / 2 + (sw ? sw.dx : 0), H / 2 + (sw ? sw.dy : 0));
    if (sw) ctx.rotate(sw.rot);
    ctx.scale(sc, sc);
    ctx.translate(-W / 2, -H / 2);
  }
  doodleBg(ctx, W, H, s.climb, doodleBiomeCols(s, s.score), s);   // couleurs ET décor fondus vers le biome suivant
  // 💀 Arène : le monde ordinaire est MASQUÉ (dalles, trous, monstres, bonus, météorites) et
  // remplacé par le seul plancher. Les coffres, eux, restent visibles : ce sont les trésors du combat.
  const arena = !!s.bossHide;
  if (arena) {
    ctx.save();
    ctx.fillStyle = 'rgba(20,8,16,0.55)'; ctx.fillRect(0, 0, W, H);   // le cauchemar assombrit tout
    ctx.restore();
    doodleBossFloor(ctx, s, W);
  } else {
    s.holes.forEach(h => doodleHole(ctx, h, s.t));
    // 🌁 Brouillard : les DALLES seules disparaissent — tout le reste (créatures, trous, coffres,
    // bonus) continue de se voir, sans quoi ce serait une mort à l'aveugle et non une épreuve.
    if (!s.blind) s.platforms.forEach(p => doodlePlatform(ctx, p, s.tw));   // ⚠ horloge du MONDE : le dessin d'une tuile à cycle doit coïncider à la frame près avec sa fenêtre mortelle
    // 🪝 Grappins en vol : chaîne depuis la dalle jusqu'à la tête, et corde tendue vers le
    // doodler tant qu'il est ramené — sans elle, on serait tiré par du vide.
    ctx.save(); ctx.lineCap = 'round';
    for (const q of s.platforms) {
      if (!q.grap) continue;
      ctx.strokeStyle = '#8a8f98'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(q.x + q.w / 2, q.y + q.h / 2); ctx.lineTo(q.grap.x, q.grap.y); ctx.stroke();
      ctx.save(); ctx.translate(q.grap.x, q.grap.y); ctx.rotate(Math.atan2(q.grap.uy, q.grap.ux));
      ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, 0, 4, -0.6, Math.PI * 1.2); ctx.stroke();     // le croc
      ctx.restore();
    }
    if (s.grab) {
      const q = s.grab.p;
      ctx.strokeStyle = '#8a8f98'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(q.x + q.w / 2, q.y + q.h / 2); ctx.lineTo(s.px, s.py); ctx.stroke();
    }
    ctx.restore();
    // ⛓️🪜 Liaisons grimpables : AVANT les filets d'eau, elles passent derrière. La CHAÎNE est
    // une suite de maillons le long de la courbe (un simple trait n'aurait rien eu d'une
    // chaîne) ; l'ÉCHELLE est deux montants et ses barreaux. Même parcours, deux traits.
    for (const c of doodleClimbAll(s)) {
      ctx.save();
      const N = 16;
      if (c.k === 'ladder') {
        for (const off of [-D_LADDER_HALF, D_LADDER_HALF]) {           // les deux montants
          ctx.strokeStyle = '#9aa0aa'; ctx.lineWidth = 2.6; ctx.beginPath();
          for (let i = 0; i <= N; i++) { const pt = doodleClimbAt(c, i / N); i ? ctx.lineTo(pt.x + off, pt.y) : ctx.moveTo(pt.x + off, pt.y); }
          ctx.stroke();
        }
        ctx.strokeStyle = '#c3c8d0'; ctx.lineWidth = 2.2;               // les barreaux
        for (let i = 1; i < N; i++) {
          const pt = doodleClimbAt(c, i / N);
          ctx.beginPath(); ctx.moveTo(pt.x - D_LADDER_HALF, pt.y); ctx.lineTo(pt.x + D_LADDER_HALF, pt.y); ctx.stroke();
        }
      } else for (let i = 0; i <= N; i++) {
        const pt = doodleClimbAt(c, i / N), nx = doodleClimbAt(c, Math.min(1, (i + 0.5) / N));
        const ang = Math.atan2(nx.y - pt.y, nx.x - pt.x);
        ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(ang);
        ctx.strokeStyle = i % 2 ? '#8f929c' : '#5c5f68'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.ellipse(0, 0, 4.6, 2.8, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // le grimpeur : un repère doré à l'endroit exact où l'on se hisse
      if (s.chainUp && s.chainUp.a === c.a && s.chainUp.b === c.b) {
        const pt = doodleClimbAt(c, s.chainUp.u);
        ctx.fillStyle = '#ffd54a'; ctx.strokeStyle = '#8a5a2c'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    // 🌪️ Tornade de barbelés : le fil en train de s'arracher, de foncer, ou refermé en anneau
    // autour du doodler. ⚠ Dessiné DANS le monde et non collé au doodler : pendant l'arrachement
    // et la ruée il n'est pas encore à lui, et la trajectoire doit se voir.
    if (s.barb) doodleBarbWire(ctx, doodleBarbPts(s.barb), s.barb.ph !== 'peel');
    // 🔥 Sommets embrasés par le lance-flammes : dessinés APRÈS les dalles, ils lèchent leur
    // bord haut. ⚠ La hauteur des flammes DÉCROÎT avec le décompte : c'est le seul signal qui
    // dise que le brasier va s'éteindre, donc quand la dalle redeviendra praticable.
    for (const q of s.platforms) {
      if (!(q.burn > 0) || q.dead || q.y < -30 || q.y > H + 30) continue;
      const k = Math.min(1, q.burn / 60);
      ctx.save();
      for (let i = 0; i < 6; i++) {
        const fx = q.x + 5 + i * (q.w - 10) / 5;
        const fh = (7 + Math.abs(Math.sin(s.t * 0.15 + i * 1.1 + q.x * 0.05)) * D_BURN_H) * k;
        ctx.fillStyle = 'rgba(255,90,26,0.88)';
        ctx.beginPath(); ctx.moveTo(fx - 4, q.y + 3); ctx.quadraticCurveTo(fx - 2, q.y - fh * 0.5, fx, q.y - fh); ctx.quadraticCurveTo(fx + 2, q.y - fh * 0.5, fx + 4, q.y + 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,222,90,0.92)';
        ctx.beginPath(); ctx.moveTo(fx - 1.9, q.y + 3); ctx.quadraticCurveTo(fx - 0.9, q.y - fh * 0.36, fx, q.y - fh * 0.6); ctx.quadraticCurveTo(fx + 0.9, q.y - fh * 0.36, fx + 1.9, q.y + 3); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // 💧 Filets d'eau : APRÈS les dalles (ils coulent devant) et depuis la MÊME liste que la
    // capture. ⚠ 10.5.1 — la cascade était un rectangle dégradé surmonté d'un fil qui serpente :
    // une barre de 7 px, pas de l'eau. Elle est refaite en QUATRE couches, du fond vers l'avant —
    // voile large, colonne aux bords turbulents, traits clairs qui DÉFILENT vers le bas,
    // éclaboussure au point d'impact. ⚠ La phase est dérivée de l'abscisse (`ph`) : sans elle,
    // deux cascades voisines coulaient en miroir parfait et l'écran se lisait comme un motif.
    {
      const flow = doodleWaterFlows(s, H);
      if (flow.falls.length) {
        ctx.save();
        const tw = s.tw;
        ctx.lineCap = 'round';
        for (const f of flow.falls) {
          const len = f.y1 - f.y0;
          if (len <= 1) continue;
          const ph = f.x * 0.07;
          // 1. Voile large : c'est lui qui donne l'épaisseur et le halo humide autour du jet.
          const g0 = ctx.createLinearGradient(0, f.y0, 0, f.y1);
          g0.addColorStop(0, 'rgba(143,216,245,0.40)'); g0.addColorStop(1, 'rgba(143,216,245,0.14)');
          ctx.fillStyle = g0; ctx.fillRect(f.x - D_WATER_W, f.y0, D_WATER_W * 2, len);
          // 2. Colonne aux DEUX bords sinusoïdaux : la largeur respire au fil de la descente,
          //    ce qu'un rectangle ne peut pas faire. ⚠ Échantillonnage à pas constant en
          //    NOMBRE de points (et non tous les 8 px) : un filet court garde ainsi sa forme.
          const n = Math.max(4, Math.min(28, Math.round(len / 9)));
          const edge = (i, side) => {
            const yy = f.y0 + len * (i / n), k = yy - f.y0;
            const wob = Math.sin((k + tw * 3.2) * 0.075 + ph) * 1.7;
            const wd = D_WATER_W / 2 * (0.84 + Math.sin((k - tw * 4.4) * 0.055 + ph * 1.7) * 0.16);
            return [f.x + wob + side * wd, yy];
          };
          const g1 = ctx.createLinearGradient(0, f.y0, 0, f.y1);
          g1.addColorStop(0, 'rgba(226,248,255,0.98)'); g1.addColorStop(0.3, 'rgba(136,213,244,0.92)'); g1.addColorStop(1, 'rgba(92,178,218,0.72)');
          ctx.fillStyle = g1;
          ctx.beginPath();
          for (let i = 0; i <= n; i++) { const [px, py] = edge(i, -1); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
          for (let i = n; i >= 0; i--) { const [px, py] = edge(i, 1); ctx.lineTo(px, py); }
          ctx.closePath(); ctx.fill();
          // 3. Trois traits clairs qui DESCENDENT à des vitesses différentes : c'est le seul
          //    élément réellement en mouvement, donc le seul qui dise « ça coule » et pas
          //    « ça ondule sur place » — le fil serpentant d'avant, lui, restait immobile.
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2;
          for (let i = 0; i < 3; i++) {
            const seg = 13 + i * 7, spd = 4.6 + i * 2.4, span = len + 34;
            const y0 = f.y0 + ((tw * spd + i * 41 + f.x * 1.3) % span) - 22;
            const a = Math.max(f.y0, y0), b = Math.min(f.y1, y0 + seg);
            if (b - a < 2) continue;
            const off = (i - 1) * 1.5, wobAt = yy => f.x + off + Math.sin((yy - f.y0 + tw * 3.2) * 0.075 + ph) * 1.7;
            ctx.beginPath(); ctx.moveTo(wobAt(a), a); ctx.lineTo(wobAt(b), b); ctx.stroke();
          }
          // 4. Lèvre du déversoir : le bourrelet clair au moment où l'eau bascule dans le vide.
          ctx.fillStyle = 'rgba(232,250,255,0.9)';
          ctx.beginPath(); ctx.ellipse(f.x, f.y0 + 1, D_WATER_W * 0.62, 2.4, 0, 0, Math.PI * 2); ctx.fill();
          // 5. Éclaboussure — seulement là où le filet RENCONTRE une dalle : mousse qui bat au
          //    ralenti et gouttes qui jaillissent en arc. Un filet qui sort par le bas de
          //    l'écran n'éclabousse rien, et une gerbe dans le vide se serait vue.
          if (f.hit) {
            const pulse = 0.65 + Math.sin(tw * 0.2 + ph) * 0.25;
            ctx.fillStyle = 'rgba(150,219,247,0.85)';                                  // ⚠ la mousse est posée 2 px AU-DESSUS du bord : à cheval sur la dalle, elle s'y fondait
            ctx.beginPath(); ctx.ellipse(f.x, f.y1 - 2, D_WATER_W * (1.4 + pulse * 0.5), 2.2 + pulse * 2.6, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(238,252,255,0.95)';
            ctx.beginPath(); ctx.ellipse(f.x, f.y1 - 3, D_WATER_W * (0.7 + pulse * 0.3), 1.4 + pulse, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#a6ddf5'; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.8;
            for (let i = 0; i < 5; i++) {
              const u = (tw * 0.05 + i * 0.21 + ph * 0.3) % 1, sg = i % 2 ? 1 : -1;
              ctx.globalAlpha = (1 - u) * 0.95;
              ctx.beginPath(); ctx.arc(f.x + sg * (3 + u * 13), f.y1 - 2 - Math.sin(u * Math.PI) * 11, 2.6 - u * 1.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            }
            ctx.globalAlpha = 1;
          }
        }
        // Film d'eau sur les dalles mouillées + gouttes qui se DÉTACHENT du bord : elles disent
        // que l'eau continue plus bas, ce que les seuls filets ne montreraient qu'après coup.
        for (const q of flow.wet) {
          ctx.fillStyle = 'rgba(143,216,245,0.6)';
          ctx.fillRect(q.x, q.y - 1, q.w, 3);
          ctx.fillStyle = 'rgba(176,228,248,0.75)';
          for (let i = 0; i < 3; i++) {
            const u = (tw * 0.028 + i * 0.34 + q.x * 0.02) % 1;
            ctx.beginPath(); ctx.arc(q.x + q.w * (0.22 + i * 0.28), q.y + q.h + u * 11, 2.1 - u * 1.2, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.restore();
      }
    }
    // 📡 Arcs électriques : APRÈS les dalles (ils passent devant les antennes) et depuis la
    // MÊME liste que les dégâts. ⚠ La dentelure est tirée de `doodleRnd` et se rafraîchit avec
    // le temps : c'est ce qui fait crépiter l'éclair au lieu d'un simple trait qui s'allume.
    if (doodleArcOn(s.tw)) {
      const arcs = doodleArcPairs(s, H);
      if (arcs.length) {
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        arcs.forEach((a, ai) => {
          const n = 7, dx = a.x2 - a.x1, dy = a.y2 - a.y1, len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;   // normale au segment : c'est sur elle qu'on écarte
          const pts = [];
          for (let i = 0; i <= n; i++) {
            const u = i / n, amp = i === 0 || i === n ? 0 : 9 * Math.sin(u * Math.PI);
            const j = (doodleRnd(ai * 31 + i * 7 + Math.floor(s.tw / 4)) - 0.5) * 2 * amp;
            pts.push([a.x1 + dx * u + nx * j, a.y1 + dy * u + ny * j]);
          }
          [['rgba(140,200,255,0.45)', 6], ['#ffe98a', 2.2]].forEach(([col, lw]) => {
            ctx.strokeStyle = col; ctx.lineWidth = lw;
            ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke();
          });
        });
        ctx.restore();
      }
    }
    s.items.forEach(it => doodleItem(ctx, it, s.t));
    s.meteors.forEach(mt => doodleMeteorDraw(ctx, mt));
  }
  // ☠️ Onde de la destructrice : deux bandes qui s'écartent de la dalle jusqu'à D_SLAYER_R,
  // c'est-à-dire exactement la portée qui vient de tuer — l'effet MONTRE sa propre zone.
  if (s.slays) s.slays.forEach(v => {
    const k = 1 - v.life / D_SLAYER_LIFE, sp = D_SLAYER_R * k;
    ctx.save(); ctx.globalAlpha = Math.max(0, v.life / D_SLAYER_LIFE) * 0.8;
    ctx.strokeStyle = '#e2564a'; ctx.lineWidth = 3 * (1 - k) + 1;
    [-1, 1].forEach(sg => { ctx.beginPath(); ctx.moveTo(0, v.y + sg * sp); ctx.lineTo(W, v.y + sg * sp); ctx.stroke(); });
    ctx.restore();
  });
  s.chests.forEach(c => doodleChest(ctx, c, s.t));
  if (s.mums) s.mums.forEach(mu => doodleMummyFall(ctx, mu, s.t));   // 𓂀 momies encore en l'air
  if (s.stals) s.stals.forEach(st => doodleStalDraw(ctx, st));       // 🧊 piques de glace en chute
  // 🔴 Traits de laser des dalles : bille rouge à halo, allongée dans son axe de marche.
  // 🔥 Le crachat du 🐉 dragonneau partage le même tableau mais PAS le même dessin : une
  // langue de feu à trois couches, sans quoi rien ne distinguerait deux dangers qui n'ont ni
  // la même vitesse, ni la même taille, ni la même origine.
  if (s.tshots) s.tshots.forEach(sh => {
    const a = Math.atan2(sh.vy, sh.vx), r = sh.r || D_TLASER_R;
    ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(a);
    if (sh.rock) {
      // 🪨 Caillou : galet gris irrégulier qui TOURNE sur lui-même (`spin`) — sans la rotation
      // il ressemblait à une bille, et une bille se lit comme un tir, pas comme une pierre.
      ctx.rotate(sh.spin - a);   // ⚠ on annule l'orientation de marche : la pierre roule, elle ne pointe pas
      ctx.fillStyle = '#8f887e'; ctx.strokeStyle = '#3f3b35'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const an = i / 7 * Math.PI * 2, rr = r * (0.82 + ((i * 37) % 11) / 40);
        const px2 = Math.cos(an) * rr, py2 = Math.sin(an) * rr;
        i ? ctx.lineTo(px2, py2) : ctx.moveTo(px2, py2);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.32, r * 0.3, r * 0.22, -0.6, 0, Math.PI * 2); ctx.fill();
    } else if (sh.back) {
      // 🛡️ Tir RENVOYÉ : la balle du joueur, retournée et passée au bleu du bouclier — c'est
      // la seule chose qui dise, en vol, que ce projectile-là vient de son propre canon.
      ctx.fillStyle = 'rgba(191,228,245,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, r * 2.4, r * 1.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5fa9dd'; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.4, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eaf7ff'; ctx.beginPath(); ctx.arc(r * 0.45, 0, r * 0.4, 0, Math.PI * 2); ctx.fill();
    } else if (sh.fire) {
      const flick = 1 + Math.sin(s.t * 0.45 + sh.x) * 0.1;
      [[r * 3.1, r * 1.5, 'rgba(255,140,58,0.26)'], [r * 2.1, r * 1.05, '#e2564a'], [r * 1.35, r * 0.68, '#ff8c3a'], [r * 0.72, r * 0.4, '#ffe89a']].forEach(([rx, ry, col], i) => {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(-rx * 0.18 * i, 0, rx * flick, ry * flick, 0, 0, Math.PI * 2); ctx.fill();
      });
    } else {
      ctx.fillStyle = 'rgba(255,111,111,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, r * 2.6, r * 1.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e2564a'; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.5, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(r * 0.5, 0, r * 0.42, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });
  // 🌋 Gouttes de lave : une VRAIE goutte — ventre rond en bas, pointe effilée qui TRAÎNE en
  // haut — là où c'était une ellipse étirée. Même grammaire que tout le reste du jeu : aplat
  // vif, gros contour sombre, un seul reflet clair, et la palette du geyser (#f0a07a/#c4553a)
  // prolongée par l'or du feu (#ffd54a) — les mêmes teintes que la gerbe du rebond.
  // ⚠ La pointe suit la VITESSE, pas le temps : à peine crachée la goutte est presque ronde,
  // en pleine chute elle s'allonge. C'est le seul indice à l'écran de sa vitesse, et c'est
  // aussi ce qui lui donne son sens de chute sans avoir à la faire tourner.
  // ⚠ Le halo et le sillage sont dessinés AVANT le corps, jamais par-dessus : posés au-dessus
  // ils voilaient l'aplat et la goutte perdait son contour franc.
  if (s.drops) s.drops.forEach(dr => {
    const st = Math.max(0.6, Math.min(2, 1 + dr.vy * 0.24));
    const r = D_LAVA_R, tip = r * (0.5 + 1.15 * st);
    ctx.save(); ctx.translate(dr.x, dr.y);
    // Halo de chaleur. ⚠ Un DÉGRADÉ, pas un aplat : deux disques translucides superposés
    // laissaient deux bords nets, qu'on lisait comme des ronds posés derrière la goutte.
    const hr = r * 2.6;
    const hg = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, hr);
    hg.addColorStop(0, 'rgba(255,170,80,0.30)'); hg.addColorStop(0.55, 'rgba(255,140,58,0.13)'); hg.addColorStop(1, 'rgba(255,140,58,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(0, -tip * 0.15, hr, hr * 1.2, 0, 0, Math.PI * 2); ctx.fill();
    // Sillage : le filet de lave encore accroché derrière la pointe.
    ctx.fillStyle = 'rgba(226,86,74,0.30)';
    ctx.beginPath(); ctx.moveTo(-r * 0.30, -tip * 0.7); ctx.quadraticCurveTo(0, -tip * 2.1, r * 0.30, -tip * 0.7); ctx.closePath(); ctx.fill();
    // Le corps de la goutte : arc du ventre, puis les deux flancs qui se rejoignent en pointe.
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI, false);
    ctx.quadraticCurveTo(-r * 0.82, -tip * 0.52, 0, -tip);
    ctx.quadraticCurveTo(r * 0.82, -tip * 0.52, r, 0);
    ctx.closePath();
    // ⚠ Le foyer du dégradé est au VENTRE, pas au centre : la lave est incandescente là où
    // elle s'accumule et refroidit vers la pointe, sans quoi la goutte n'a plus de sens de
    // chute. ⚠ Et il reste ORANGE dominant : un cœur clair trop large avalait tout le dégradé
    // et la goutte se lisait comme une tache blanche cerclée de rouge.
    const g = ctx.createRadialGradient(0, r * 0.35, r * 0.1, 0, -tip * 0.15, r * 1.9);
    g.addColorStop(0, '#ffe89a'); g.addColorStop(0.22, '#ffd54a'); g.addColorStop(0.5, '#ff8c3a'); g.addColorStop(0.78, '#e2564a'); g.addColorStop(1, '#c4553a');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#7a1f18'; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
    // Reflet : une virgule claire en haut à gauche du ventre, comme sur les yeux des créatures.
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-r * 0.42, -r * 0.02, r * 0.15, r * 0.27, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
  if (!arena) s.monsters.forEach(m => {
    doodleMonster(ctx, m, s.t);
    // 🔵 Figée par le Cryogène : gangue bleutée + éclats. ⚠ Dessinée PAR-DESSUS la créature et
    // non à sa place : on doit continuer de reconnaître ce qu'on a gelé (et ce qui tue encore).
    if (!m.froz) return;
    ctx.save();
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#bfe4f5';
    doodleRR(ctx, m.x - 2, m.y - 2, m.w + 4, m.h + 4, 6, '#bfe4f5');
    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(m.x + 4, m.y + m.h * 0.3); ctx.lineTo(m.x + m.w * 0.45, m.y + 2);
    ctx.moveTo(m.x + m.w * 0.55, m.y + m.h - 2); ctx.lineTo(m.x + m.w - 4, m.y + m.h * 0.55); ctx.stroke();
    ctx.restore();
  });
  // 🍄 Hallucinations : les mêmes créatures, mais translucides, dédoublées et irisées. ⚠ Elles
  // sont dessinées APRÈS les vraies : superposées, c'est la vraie qu'on doit voir en premier.
  if (s.hall && s.hall.length) {
    ctx.save();
    for (const hm of s.hall) {
      const f = Math.min(1, Math.min(hm.life, hm.max - hm.life) / 26);
      // Deux fantômes décalés en `lighter` : le dédoublement de l'image est ce qui dit
      // « ça n'est pas là » sans avoir à l'écrire.
      for (let i = 0; i < 2; i++) {
        ctx.globalAlpha = 0.30 * f;
        ctx.globalCompositeOperation = i ? 'lighter' : 'source-over';
        ctx.save();
        ctx.translate(Math.sin(s.t * 0.09 + hm.wt) * (i ? 5 : -5), Math.cos(s.t * 0.07 + hm.wt) * (i ? -4 : 4));
        doodleMonster(ctx, hm, s.t);
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  s.parts.forEach(pt => { ctx.globalAlpha = Math.max(0, pt.life / pt.max); ctx.fillStyle = pt.c; ctx.fillRect(pt.x, pt.y, pt.sz, pt.sz); });
  ctx.globalAlpha = 1;
  if (s.pops) s.pops.forEach(g => doodlePopDraw(ctx, g));
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#3a7d1e';
  // 🔆 Le laser se dessine en trait allongé dans son axe de tir, halo compris : une bille
  // ordinaire à cette vitesse serait invisible d'une frame à l'autre.
  s.bullets.forEach(b => {
    // 🚀 Missile : dessiné DANS SON CAP (ogive, ailerons, flamme). Une bille ordinaire n'aurait
    // rien dit de la poursuite, qui est tout l'intérêt de l'arme.
    if (b.missile) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
      if (b.sz > 1) ctx.scale(b.sz, b.sz);                                                               // 🔎 Gros calibre : toute l'ogive grandit d'un bloc
      ctx.fillStyle = Math.floor(s.t / 3) % 2 ? '#ffd54a' : '#ff8c3a';                                   // flamme, qui bat
      ctx.beginPath(); ctx.moveTo(-8, -3.6); ctx.lineTo(-18, 0); ctx.lineTo(-8, 3.6); ctx.closePath(); ctx.fill();
      // ⚠ Fuselage SOMBRE et non blanc : le fond du jeu est un papier crème, une fusée claire
      // s'y effaçait — on ne voyait plus que la flamme et le missile devenait illisible.
      ctx.fillStyle = '#4a5563';
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(3, -4.6); ctx.lineTo(-8, -4.6); ctx.lineTo(-8, 4.6); ctx.lineTo(3, 4.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e2564a';                                                                          // ogive + ailerons
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(4, -3.8); ctx.lineTo(4, 3.8); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6, -4.6); ctx.lineTo(-11, -9); ctx.lineTo(-2, -4.6); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6, 4.6); ctx.lineTo(-11, 9); ctx.lineTo(-2, 4.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#cdd6e0';                                                                          // hublot, pour donner le sens de marche d'un coup d'œil
      ctx.beginPath(); ctx.arc(0, 0, 2.1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    const bz = b.sz || 1;
    // 🌪️ Aiguille du fil barbelé qui explose : un éclat d'acier effilé, dessiné DANS SON AXE.
    // Une bille verte n'aurait rien dit de sa provenance ni de son sens de vol.
    if (b.needle) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx)); ctx.scale(bz, bz);
      ctx.fillStyle = '#8a9099';
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -2.1); ctx.lineTo(-5, 2.1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#eef2f6';
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, -0.9); ctx.lineTo(-4, 0.9); ctx.closePath(); ctx.fill();
      ctx.restore(); return;
    }
    if (!b.laser) { ctx.fillStyle = '#3a7d1e'; ctx.beginPath(); ctx.arc(b.x, b.y, 4 * bz, 0, Math.PI * 2); ctx.fill(); return; }
    // ⚠ Le laser grossit en ÉPAISSEUR seulement : allonger aussi le trait aurait fait un
    // rayon de 156 px au 5e palier, plus long que la moitié du plateau.
    const n = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / n, uy = b.vy / n, L = 26;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(120,230,255,0.45)'; ctx.lineWidth = 8 * bz;
    ctx.beginPath(); ctx.moveTo(b.x - ux * L, b.y - uy * L); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = '#eafcff'; ctx.lineWidth = 3 * bz;
    ctx.beginPath(); ctx.moveTo(b.x - ux * L * 0.8, b.y - uy * L * 0.8); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  });
  // 🟢 Traînée corrosive : flaques qui s'estompent en séchant, avec quelques bulles.
  if (s.trail && s.trail.length) {
    ctx.save();
    for (const tr of s.trail) {
      const k = Math.max(0, tr.life / tr.max);
      ctx.globalAlpha = k * 0.55;
      ctx.fillStyle = '#8fe000'; ctx.beginPath(); ctx.ellipse(tr.x, tr.y, D_PAINT_TOX_R * (0.6 + k * 0.4), D_PAINT_TOX_R * 0.45 * (0.6 + k * 0.4), 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = k * 0.8;
      ctx.fillStyle = '#d8ff6a'; ctx.beginPath(); ctx.arc(tr.x + Math.sin(tr.life * 0.2) * 5, tr.y - 2, 2 * k + 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // 🟡 Éclair du Paratonnerre : un trait brisé qui descend du haut de l'écran jusqu'à la cible.
  // ⚠ Le zigzag est DÉTERMINISTE (`seed`) : retiré au hasard à chaque frame, l'éclair aurait
  // frétillé au lieu de frapper.
  if (s.bolts && s.bolts.length) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const bo of s.bolts) {
      ctx.globalAlpha = Math.max(0, bo.life / bo.max);
      [['#fff6c8', 6], ['#ffd54a', 2.6]].forEach(([col, lw]) => {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        // ⛈️ L'orage frappe DEPUIS le centre de sa dalle ; le 🟡 Paratonnerre, lui, depuis le haut
        // de l'écran, à l'aplomb de sa cible (ni `x0` ni `y0`). ⚠ Le zigzag mord sur la
        // PERPENDICULAIRE au trait, et non sur l'axe des x : sur un éclair oblique, un décalage
        // horizontal l'aurait simplement épaissi au lieu de le briser.
        // ⚠ Le dernier point est posé SANS décalage : la pointe doit toucher exactement ce
        // qu'elle foudroie, sinon l'éclair rate visiblement ce que le code vient de détruire.
        const sx = bo.x0 == null ? bo.x : bo.x0, sy = bo.y0 || 0;
        const ex = bo.x - sx, ey = bo.y - sy, el = Math.hypot(ex, ey) || 1;
        const px2 = -ey / el, py2 = ex / el;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        for (let i = 1; i <= 7; i++) {
          const k = i / 7, off = i === 7 ? 0 : Math.sin(bo.seed + i * 2.3) * 13;
          ctx.lineTo(sx + ex * k + px2 * off, sy + ey * k + py2 * off);
        }
        ctx.stroke();
      });
      ctx.globalAlpha *= 0.6; ctx.fillStyle = '#fff6c8';
      ctx.beginPath(); ctx.arc(bo.x, bo.y, 13, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  ctx.fillStyle = '#3a7d1e';
  s.booms.forEach(b => doodleBoomDraw(ctx, b));
  // ⚠ 9.1.3 — L'invulnérabilité se VOIT (halo doré + clignotement) : sans signal à l'écran,
  // 2 s d'immunité seraient indiscernables d'un coup de chance, et on ne saurait pas quand
  // elles s'arrêtent. Le halo est dessiné SOUS le doodler pour ne pas le masquer.
  // 🟦 La cabine du TARDIS. ⚠ Peinte HORS des `ctx.save()` du halo d'invulnérabilité et de la
  // teinte portée : à l'intérieur, un 🟧 Colosse ou une 🔷 Miniature aurait mis la cabine à
  // l'échelle du doodler, et le clignotement de l'invulnérabilité l'aurait fait clignoter avec lui.
  // ⚠ L'ORDRE dépend de la phase : à l'embarquement la cabine passe DEVANT (le doodler s'y
  // engouffre et disparaît derrière les portes), au dépôt elle passe DERRIÈRE (il sort de
  // l'encadrement, et l'intérieur noir l'aurait mangé).
  const tbox = s.tardis ? doodleTardisPos(s) : null;
  const tdraw = () => doodleTardisBox(ctx, tbox.x, tbox.y, 1, doodleTardisOpen(s), s.t, s.tardis.fade == null ? 1 : s.tardis.fade);
  if (tbox && s.tardis.ph === 'drop') tdraw();
  const inv = s.inv > 0;
  if (inv) {
    ctx.save();
    ctx.globalAlpha = Math.floor(s.t / 4) % 2 ? 0.45 : 1;
    ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(s.px, s.py, 24, 0, Math.PI * 2); ctx.stroke();
  }
  // ➡️ Tapis roulant : chevrons de vitesse DERRIÈRE le doodler, dans le sens de la dérive.
  // ⚠ Dessinés avant lui pour ne jamais le masquer, et leur opacité suit le décompte : on voit
  // l'entraînement faiblir avant qu'il ne cesse.
  if (s.beltLeft > 0) {
    const dir = s.beltVx > 0 ? 1 : -1, k = Math.min(1, s.beltLeft / 40);
    ctx.save(); ctx.strokeStyle = '#e0a13a'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const off = 16 + i * 9 + ((s.t * 1.4) % 9);
      ctx.globalAlpha = k * (0.65 - i * 0.17);
      ctx.beginPath();
      ctx.moveTo(s.px - dir * off, s.py - 8); ctx.lineTo(s.px - dir * (off - 6), s.py); ctx.lineTo(s.px - dir * off, s.py + 8);
      ctx.stroke();
    }
    ctx.restore();
  }
  // 👥 Les clones sont dessinés AVANT le doodler et légèrement translucides : dans une mêlée
  // à cinq silhouettes identiques, il faut pouvoir dire en un coup d'œil laquelle on pilote.
  if (s.clones) {
    ctx.save(); ctx.globalAlpha = 0.75;
    for (const c of s.clones) doodleDoodler(ctx, c.x, c.y, c.face, null, s.t, c.pal);
    ctx.restore();
  }
  // 🖌️ Teinte portée : la palette du corps, la taille (🔷 Miniature / 🟧 Colosse) et la
  // transparence (🫥 Invisible). ⚠ L'échelle est prise AUTOUR du doodler (translate → scale →
  // translate inverse) : un `scale` nu aurait aussi déplacé le personnage vers le coin haut-gauche.
  const ppal = doodlePaintPal(s), pscl = doodlePaintSize(s), pgho = doodlePaintIs(s, 'invis');
  const pwrap = pscl !== 1 || pgho;
  if (pwrap) {
    ctx.save();
    if (pgho) ctx.globalAlpha *= 0.34;
    if (pscl !== 1) { ctx.translate(s.px, s.py); ctx.scale(pscl, pscl); ctx.translate(-s.px, -s.py); }
  }
  // 🟦 Pendant le voyage le doodler est DANS la cabine : on ne le dessine plus (`td.hid`).
  // ⚠ L'ORDRE change selon la phase, et ce n'est pas cosmétique : à l'embarquement la cabine
  // passe DEVANT (le doodler s'y engouffre et disparaît derrière les portes), au dépôt elle
  // passe DERRIÈRE (il sort de l'encadrement, et l'intérieur noir l'aurait mangé).
  if (!(s.tardis && s.tardis.hid)) doodleDoodler(ctx, s.px, s.py, s.faceTimer > 0 ? 0 : s.face, s.fly > 0 ? s.flyType : null, s.t, ppal);
  if (pwrap) ctx.restore();
  if (tbox && s.tardis.ph !== 'drop') tdraw();
  // (la cabine du dépôt a déjà été peinte plus haut, avant le halo d'invulnérabilité)
  if (inv) ctx.restore();
  // ✴️ Shurikens : dessinés APRÈS le doodler (elles tournent DEVANT lui la moitié du temps)
  // et avant les boucliers, dont le halo doit rester au premier plan.
  if (s.shur && s.shur.length) {
    ctx.save();
    for (const sh of s.shur) {
      const sx = s.px + Math.cos(sh.a) * D_SHURIKEN_R, sy = s.py + Math.sin(sh.a) * D_SHURIKEN_R, sz = doodleShurikenMul(s);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(s.t * 0.4); if (sz > 1) ctx.scale(sz, sz);
      ctx.fillStyle = '#e8eef5'; ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const r = i % 2 ? 2.6 : 7.4, a = i / 8 * Math.PI * 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2b2b33'; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  doodleShieldAura(ctx, s);   // 🛡️ boucliers portés : APRÈS le doodler (sinon il les masque), AVANT le brouillard et le HUD
  // 🎊 Confettis : AU PREMIER PLAN, donc après le doodler. ⚠ Chaque papier est dessiné avec un
  // ÉCRASEMENT vertical piloté par sa phase (`Math.cos(ph)`) : c'est ce qui donne l'illusion
  // qu'il tourne sur lui-même en tombant. Un simple rectangle plein aurait fait de la neige.
  if (s.confs && s.confs.length) {
    ctx.save();
    for (const cf of s.confs) {
      ctx.save(); ctx.translate(cf.x, cf.y); ctx.rotate(cf.rot);
      ctx.fillStyle = cf.c;
      ctx.fillRect(-cf.w / 2, -cf.h / 2 * Math.abs(Math.cos(cf.ph)), cf.w, Math.max(1, cf.h * Math.abs(Math.cos(cf.ph))));
      ctx.restore();
    }
    ctx.restore();
  }
  // 🌬️ Vent de la girouette : des filets d'air balaient TOUT L'ÉCRAN dans son sens, tant que
  // l'effet dure — le voile est plus dense du côté d'où il souffle, pour qu'on lise la direction
  // sans avoir à chercher la dalle. ⚠ En coordonnées d'ÉCRAN et non de monde : c'est de l'air, il
  // ne grimpe pas avec le décor — solidaire des dalles, il aurait filé vers le bas à chaque saut.
  // ⚠ Les filets sont COURBÉS (quadratique) : un trait droit se lit comme une ligne de vitesse,
  // c'est-à-dire comme le doodler qui va vite, exactement le contraire de ce qu'on annonce ici.
  if (s.galeV > 0.01 && s.galeD) {
    const gk = s.galeV;
    const gl = Math.hypot(s.galeD.x, s.galeD.y) || 1;
    const gdx = s.galeD.x / gl, gdy = s.galeD.y / gl;          // le sens du vent, unitaire
    const gpx = -gdy, gpy = gdx;                               // sa perpendiculaire : l'étalement des filets
    const gspan = Math.abs(gdx) * W + Math.abs(gdy) * H + 120; // longueur du couloir parcouru
    const gacr = Math.abs(gpx) * W + Math.abs(gpy) * H + 40;   // … et sa largeur
    const gcx = W / 2, gcy = H / 2;
    ctx.save();
    const gg = ctx.createLinearGradient(gcx - gdx * W, gcy - gdy * H, gcx + gdx * W, gcy + gdy * H);
    gg.addColorStop(0, 'rgba(120,176,224,0.30)'); gg.addColorStop(1, 'rgba(120,176,224,0)');
    ctx.globalAlpha = gk; ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H);
    // ⚠ Filets BLEU ARDOISE et non blancs : le carnet est un papier CLAIR dans tous les biomes,
    // et des filets blancs y étaient purement et simplement invisibles.
    ctx.strokeStyle = '#4a8fc8'; ctx.lineCap = 'round';
    for (let i = 0; i < D_GALE_STREAKS; i++) {
      const sp = 2.6 + doodleRnd(i) * 5.4;
      const gu = ((doodleRnd(i + 13) * gspan + s.t * sp) % gspan + gspan) % gspan - gspan / 2;
      const gv = (doodleRnd(i + 29) - 0.5) * gacr + Math.sin(s.t * 0.05 + i) * 4;
      const gln = 16 + doodleRnd(i + 51) * 34;
      const bow = (doodleRnd(i + 67) - 0.5) * 10;
      const ax = gcx + gdx * gu + gpx * gv, ay = gcy + gdy * gu + gpy * gv;
      ctx.globalAlpha = (0.26 + doodleRnd(i + 7) * 0.38) * gk;
      ctx.lineWidth = 1.1 + doodleRnd(i + 3) * 1.4;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(ax + gdx * gln * 0.5 + gpx * bow, ay + gdy * gln * 0.5 + gpy * bow, ax + gdx * gln, ay + gdy * gln);
      ctx.stroke();
    }
    ctx.restore();
  }
  // 🏜️ Tempête de sable : voile ocre + grains qui filent en diagonale + rafales horizontales.
  // ⚠ Les grains sont déterministes (doodleRnd) et ne coûtent qu'un rectangle chacun : une
  // gerbe de particules réelles aurait saturé le tableau `parts` pendant 5 secondes.
  // ⚠ Le voile FAIBLIT sur la dernière seconde : sans ce dégagement, la tempête s'arrêtait
  // net et on ne comprenait pas ce qui venait de changer.
  if (s.sandLeft > 0) {
    const k = Math.min(1, s.sandLeft / 60);
    ctx.save();
    ctx.globalAlpha = D_SAND_VEIL * k;
    ctx.fillStyle = '#d9ad63'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.5 * k;
    ctx.fillStyle = '#f5e0b0';
    for (let i = 0; i < D_SAND_GRAINS; i++) {
      const sp = 3 + doodleRnd(i) * 7;
      const gx = ((doodleRnd(i) * W - s.t * sp) % (W + 40) + W + 40) % (W + 40) - 20;
      const gy = ((doodleRnd(i + 77) * H + s.t * sp * 0.28) % (H + 40) + H + 40) % (H + 40) - 20;
      ctx.fillRect(gx, gy, 1 + doodleRnd(i + 5) * 2.2, 1 + doodleRnd(i + 9) * 1.4);
    }
    ctx.globalAlpha = 0.22 * k; ctx.strokeStyle = '#fff1d0'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 7; i++) {
      const gy = ((doodleRnd(i + 31) * H + s.t * (2 + doodleRnd(i + 41) * 3)) % (H + 30) + H + 30) % (H + 30) - 15;
      ctx.beginPath();
      for (let px = 0; px <= W; px += 14) ctx.lineTo(px, gy + Math.sin(px * 0.05 + s.t * 0.06 + i) * 3);
      ctx.stroke();
    }
    ctx.restore();
  }
  // 🕯️ Esprits : voile translucide, deux yeux vides et une traîne ondulante. En guet, un
  // liseré pulse pour dire qu'il va charger ; en charge, une comète le suit.
  if (s.spirits && s.spirits.length) {
    ctx.save();
    for (const sp of s.spirits) {
      const rushing = sp.state !== 'wait';
      if (rushing) {                                                     // traîne de charge
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#c9a8ff';
        for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(sp.x - sp.vx * i * 1.8, sp.y - sp.vy * i * 1.8, D_SPIRIT_R * (1 - i * 0.22), 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = rushing ? 0.95 : 0.75 + Math.sin(s.t * 0.09 + sp.ph) * 0.2;
      ctx.fillStyle = '#efe6ff'; ctx.strokeStyle = '#6a4bb0'; ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y - 2, D_SPIRIT_R * 0.72, Math.PI, 0);
      const n = 4, span = D_SPIRIT_R * 1.44;
      for (let i = 0; i < n; i++) {
        const bx = sp.x + D_SPIRIT_R * 0.72 - (i + 0.5) * (span / n);
        ctx.arc(bx, sp.y - 2 + D_SPIRIT_R * 0.62 + Math.sin(s.t * 0.14 + i + sp.ph) * 1.8, span / n / 2, 0, Math.PI);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a2a55';
      [-4.6, 4.6].forEach(dx => { ctx.beginPath(); ctx.ellipse(sp.x + dx, sp.y - 3, 2.2, 3.2, 0, 0, Math.PI * 2); ctx.fill(); });
      ctx.beginPath(); ctx.ellipse(sp.x, sp.y + 3, 2.6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
      if (!rushing) {
        ctx.globalAlpha = 0.35 + Math.sin(s.t * 0.16 + sp.ph) * 0.3;
        ctx.strokeStyle = '#c9a8ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, D_SPIRIT_R + 5, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }
  // 🌫️ Brouillard : halo clair autour du doodler, le reste s'assombrit. ⚠ Dessiné APRÈS le
  // décor mais AVANT le HUD — un malus ne doit jamais cacher les compteurs.
  if (s.mfog > 0) {
    const gr = ctx.createRadialGradient(s.px, s.py, 40, s.px, s.py, 200);
    gr.addColorStop(0, 'rgba(40,44,54,0)'); gr.addColorStop(1, 'rgba(40,44,54,0.82)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  if (arena) doodleBossDraw(ctx, s, W, H);   // 💀 ce qui tue passe devant ce qui décore
  if (warped) ctx.restore();                // 🍄🔍 fin de l'ondulation et du zoom : le HUD se lit toujours d'aplomb, à l'échelle 1
  doodleShroomVeil(ctx, W, H, s);           // 🍄 … et le voile coloré par-dessus le monde, sous le HUD
  // 🎨 Inverseuse : un blanc plein écran en composition `difference` retourne d'un coup tout ce
  // qui vient d'être dessiné. ⚠ Après le retournement et avant le HUD, pour les mêmes raisons.
  if (s.neg > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  doodleNotif(ctx, s, W, H);
  doodlePerkHud(ctx, s, W); doodleToast(ctx, s, W); doodleBanner(ctx, s, W, H);
}
// ⚠ 11.2.6 — NAISSANCE D'UNE DALLE, EXTRAITE DE `doodleSpawnRow`. Elle ne servait qu'à la
// dalle tirée pour la rangée ; depuis que la jumelle de l'🌈 Arc-en-ciel est une VRAIE tuile
// jouable, il faut lui donner EXACTEMENT la même naissance (mèche du casino, phase de cycle,
// sens du tapis, ancre de la vivante, dalle verte de secours d'une pique…). Deux appels, une
// seule source de vérité : recopier ce bloc, c'était garantir qu'un jour une tuile marche
// d'un côté et pas de l'autre.
// ⚠ `p.type` PEUT CHANGER ici (🎲 Roulette russe qui rate son tirage) : l'appelant doit le
// relire sur la dalle, jamais garder sa variable locale.
function doodleTileBirth(s, p, diff) {
  const x = p.x, ny = p.y, w = p.w;
  let type = p.type;
  // 🃏 Casino : CHAQUE dalle tire son effet à la naissance, parmi les tuiles déjà débloquées —
  // deux casinos d'une même partie n'ont donc pas le même. ⚠ Repli sur la table complète si le
  // casino est la seule tuile débloquée : sans lui, la toute première serait une dalle morte.
  // ⚠ 12.7.6 — JAMAIS une tuile de BIOME (demande utilisateur) : depuis que la 🎰 Machine à sous
  // sait en ajouter à `s.tiles`, le casino pouvait ressortir une 🌵 Pique ou une 🫧 Bulle hors
  // de son biome. Le filtre est ici, sur le vivier — pas au dessin, qui doit rester le miroir
  // de ce que la dalle FAIT.
  if (type === 'casino') {
    const pool = s.tiles.filter(k => k !== 'casino' && !D_BIOME_TILES.has(k));
    const all = D_TILES.map(t2 => t2.k).filter(k => k !== 'casino');
    const src = pool.length ? pool : all;
    p.roll = src[Math.floor(Math.random() * src.length)];
  }
  // ⚠ À partir d'ici tout se règle sur le type EFFECTIF : un casino doit naître avec la mèche,
  // la phase ou le sens d'entraînement de la tuile qu'il imite.
  const type2 = doodleEffType(p);
  // 🦎 Caméléon : il emprunte l'apparence d'une tuile déjà débloquée. ⚠ Ni caméléon (il se
  // copierait lui-même), ni casino (qui tire encore un autre déguisement au dessin).
  // ⚠ Réglé sur le type EFFECTIF et non sur `type` : un 🃏 Casino peut tirer le caméléon, et
  // sans déguisement il se serait dessiné avec le repli de fin de table, c'est-à-dire en bombe.
  if (type2 === 'chameleon') {
    // ⚠ 11.2.4 — IL NE COPIE QUE CE QUI EXISTE DANS CETTE PARTIE (demande utilisateur). Deux
    // fuites le trahissaient : le repli `all` piochait dans TOUTE la table D_TILES dès que rien
    // n'était encore débloqué — il annonçait donc des effets que la partie ne pouvait pas
    // produire — et le vivier ignorait les tuiles de BIOME, alors que la moitié des effets y
    // sont passés (🫧 Bulle, 🦑 Tentacule, 🌵 Pique…) : le caméléon ne savait pas imiter ce que
    // le joueur avait sous les yeux. Source = tuiles DÉBLOQUÉES + tuiles des biomes TRAVERSÉS,
    // la même notion de « déjà rencontré » que le vivier de la 🌈 Peinture instable.
    // ⚠ Plus AUCUN repli : sans modèle disponible il reste `p.cham` nul, et le dessin le rend
    // alors en dalle verte ordinaire — ce qu'il est réellement.
    const src = [...new Set([...s.tiles, ...doodleBiomeSeen(s, doodleTier(s.score))])]
      .filter(k => k !== 'chameleon' && k !== 'casino');
    p.cham = src.length ? src[Math.floor(Math.random() * src.length)] : null;
  }
  if (D_SPIKY.has(type2)) p.armed = false;
  if (type2 === 'ghost') p.fade = 0;
  // 🌬️ Le point cardinal de la girouette, tiré une fois pour toutes et affiché dès sa naissance.
  // ⚠ Depuis 12.5.9 le palier de biome n'est plus mémorisé ICI mais sur la bourrasque
  // (`s.galeWind.tier`) : c'est elle qui doit tomber au changement de biome, et elle survit
  // désormais à la dalle qui l'a levée.
  if (type2 === 'gale') p.g4 = Math.floor(Math.random() * D_GALE_DIRS.length);
  // ⏲️ Balancier : sa phase est tirée à la naissance, sinon tous ceux de l'écran battraient ensemble.
  if (type2 === 'pendul') p.pph = Math.random() * Math.PI * 2;
  // 🔦 Projecteur : sa phase est tirée à la naissance, sinon tous ceux de l'écran balaieraient ensemble.
  if (type2 === 'searchlight') p.ph = Math.random() * Math.PI * 2;
  // ⛈️ Phase TIRÉE AU HASARD par dalle, comme les tuiles à cycle : sans elle, tous les orages de
  // l'écran frapperaient à l'unisson et il n'y aurait plus qu'un seul instant à craindre.
  if (type2 === 'storm') p.stormT = Math.random() * D_STORM_EVERY;
  if (type2 === 'bomb') p.fuse = 0;
  // ⚠ Phase TIRÉE AU HASARD par dalle : sans elle, toutes les tuiles à cycle de l'écran
  // clignoteraient à l'unisson et il n'y aurait plus qu'un seul instant sûr pour tout le monde.
  // ⚠ La phase est tirée sur le PLUS LONG des deux cycles : bornée à 120 (l'ancien cycle des
  // picots), toutes les dalles de picots seraient nées dans les 120 premières frames d'un
  // cycle qui en compte 156, et aucune n'aurait jamais démarré piques déjà sorties.
  if (type2 === 'picots' || type2 === 'zap') p.ph = Math.floor(Math.random() * Math.max(D_PICOT_CYCLE, D_ZAP_CYCLE));
  if (type2 === 'origami') { p.ph = Math.floor(Math.random() * D_ORIGAMI_STEP * 3); p.ori = doodleOrigamiForm(p, s.tw || 0); }
  // 🥚 Elle naît affamée, donc TRAVERSANTE — et une rangée qu'on traverse est une rangée qui
  // n'existe pas. Comme la 🌵 Pique, la seule autre dalle qui peut fermer la voie, elle vient
  // donc toujours avec une verte de secours à l'autre bout de la MÊME rangée : sans elle, se
  // retrouver à sec de munitions devant un tamagotchi aurait été une partie perdue sans faute.
  if (type2 === 'light') { p.ph = Math.floor(Math.random() * D_LIGHT_STEP * 3); p.lit = doodleLightPhase(p, s.tw || 0); }
  if (type2 === 'alive') { p.ax = x; p.ay = ny; p.lookX = 0; p.lookY = 1; }   // 👀 l'ancre de sa boîte de déplacement
  if (type2 === 'egg') p.egg = D_EGG_JUMPS;   // 🪺 le compte à rebours, en sauts du joueur
  if (type2 === 'flag') p.flag = Math.floor(Math.random() * ((typeof FLAGS !== 'undefined' && FLAGS.length) || 1));   // 🚩 le pays hissé
  if (type2 === 'tamagotchi') {
    p.tama = false; p.meals = 0;   // ⚠ le compteur de repas naît AVEC elle : `(p.meals || 0)` partout ailleurs ne dirait pas la différence entre « pas encore mangé » et « pas un tamagotchi »
    const tx = (x + w / 2 < DOODLE_W / 2) ? DOODLE_W - w - 8 : 8;
    s.platforms.push({ x: tx, y: ny, w, h: D_PLAT_H, type: 'green', dead: false });
  }
  if (type2 === 'paint') p.paint = Math.floor(Math.random() * D_PAINTS.length);   // 🖌️ sa teinte, tirée une fois pour toutes et affichée dès sa naissance
  if (type2 === 'belt') p.dir = Math.random() < 0.5 ? -1 : 1;
  if (type2 === 'lift') { p.y0 = ny; p.vy2 = (Math.random() < 0.5 ? -1 : 1) * D_LIFT_V; }
  // 🐛 Buguée : les DEUX vitesses posées d'un coup, chacune de sens tiré au sort — c'est le
  // couple qui fait la diagonale. ⚠ `span2` remplace la portée de l'ascenseur pour cette
  // dalle-là seulement : la boucle verticale est commune aux deux, elle lit donc la portée
  // sur la dalle et non dans une constante unique.
  if (type2 === 'glitch') {
    p.y0 = ny; p.span2 = D_GLITCH_SPAN;
    p.vy2 = (Math.random() < 0.5 ? -1 : 1) * D_GLITCH_VY;
    p.gvx = (Math.random() < 0.5 ? -1 : 1) * D_GLITCH_VX;
  }
  // ⚠ La pique est la SEULE tuile mortelle : elle vient donc toujours avec une plateforme
  // verte de secours sur la MÊME ligne, à l'autre bout de l'écran (« toujours une case pas
  // loin »). Sans elle, une pique pourrait fermer la seule voie et rendre la montée
  // impossible — un piège n'est un piège que s'il est évitable.
  if (D_SPIKY.has(type2)) {
    const sx = (x + w / 2 < DOODLE_W / 2) ? DOODLE_W - w - 8 : 8;
    s.platforms.push({ x: sx, y: ny, w, h: D_PLAT_H, type: 'green', dead: false });
  }
  if (type === 'rainbow') p.uses = D_RAINBOW_MIN + Math.floor(Math.random() * (D_RAINBOW_MAX - D_RAINBOW_MIN + 1));
  if (type === 'blue') p.vx = (Math.random() < 0.5 ? -1 : 1) * (D_BLUE_V + diff * D_BLUE_RAMP);
  if (type === 'green' || type === 'blue') { const rr = Math.random(); if (rr < 0.02) p.trampoline = true; else if (rr < 0.11) p.spring = true; }
  // 🎲 Roulette russe : la vraie dalle est accompagnée de leurres identiques, et le tirage
  // s'épuise à chaque apparition. ⚠ Les positions sont réparties sur la rangée sans
  // chevauchement, et c'est le HASARD qui décide laquelle des places reçoit la vraie.
  if (type === 'roulette') {
    if (Math.random() >= (s.rrP == null ? 1 : s.rrP)) { p.type = 'green'; type = 'green'; }
    else {
      const n = Math.min(D_RR_MAX, s.rrN == null ? D_RR_START : s.rrN);
      const step = (DOODLE_W - 12 - w) / Math.max(1, n - 1);
      const real = Math.floor(Math.random() * n);
      for (let i = 0; i < n; i++) {
        const qx = 6 + step * i;
        if (i === real) { p.x = qx; continue; }
        s.platforms.push({ x: qx, y: ny, w, h: D_PLAT_H, type: 'rrfake', dead: false });
      }
      s.rrN = Math.min(D_RR_MAX, (s.rrN == null ? D_RR_START : s.rrN) + 1);
      s.rrP = (s.rrP == null ? 1 : s.rrP) * D_RR_DECAY;
    }
  }
  // ⛓️ Chaîne : la dalle tirée est le point HAUT, et sa jumelle naît plus BAS, à une abscisse
  // proche — la chaîne pend entre les deux. ⚠ La jumelle va EN DESSOUS, jamais au-dessus : posée
  // plus haut, elle abaisserait `topY` et la génération croirait la rangée suivante déjà faite.
  // ⚠ L'écart horizontal est BORNÉ : deux pieds aux antipodes auraient donné une chaîne presque
  // horizontale, qu'on ne lit plus comme quelque chose qui se grimpe.
  if (type === 'chain') {
    const id = (s.chainSeq = (s.chainSeq || 0) + 1);
    p.chain = id;
    let x2 = 6 + Math.random() * (DOODLE_W - w - 12);
    for (let k = 0; k < 12 && Math.abs(x2 - x) > D_CHAIN_MAXX; k++) x2 = 6 + Math.random() * (DOODLE_W - w - 12);
    s.platforms.push({ x: x2, y: ny + D_CHAIN_DY[0] + Math.random() * (D_CHAIN_DY[1] - D_CHAIN_DY[0]),
                       w, h: D_PLAT_H, type: 'chain', chain: id, dead: false });
  }
  // 🪜 Échelle de prison : même mécanique que la ⛓️ Chaîne, mais VERTICALE — la jumelle naît
  // juste en dessous, à la MÊME abscisse. C'est ce qui en fait une échelle et non une corde.
  if (type === 'ladder') {
    // 20 % plus longue, et recalée dans l'écran : élargie vers la droite, elle en serait sortie.
    const lw = D_LADDER_W, lx = Math.max(6, Math.min(x, DOODLE_W - 6 - lw));
    const by = ny + D_LADDER_DY[0] + Math.random() * (D_LADDER_DY[1] - D_LADDER_DY[0]);
    // ⚠ Le dégagement des DEUX dalles est exigé avant d'en poser une seule : la basse naît au
    // milieu de rangées déjà générées, c'est elle qui trouve le plus souvent une voisine.
    if (!doodleRectFree(s, { x: lx, y: ny, w: lw, h: D_PLAT_H }) ||
        !doodleRectFree(s, { x: lx, y: by, w: lw, h: D_PLAT_H })) {
      p.type = 'green';   // pas de place : ni échelle ni jumelle, une plateforme ordinaire
    } else {
      const id = (s.ladderSeq = (s.ladderSeq || 0) + 1);
      p.ladder = id; p.w = lw; p.x = lx;
      s.platforms.push({ x: lx, y: by, w: lw, h: D_PLAT_H, type: 'ladder', ladder: id, dead: false });
    }
  }
  // 🚇 Tuyaux : la dalle tirée devient une bouche, et sa JUMELLE naît aussitôt une à deux
  // rangées plus bas, sur une abscisse franchement écartée — deux bouches côte à côte se
  // seraient confondues et la traversée n'aurait rien voulu dire.
  if (type === 'pipe') {
    const id = (s.pipeSeq = (s.pipeSeq || 0) + 1);
    p.pipe = id;
    let x2 = 6 + Math.random() * (DOODLE_W - w - 12);
    for (let k = 0; k < 10 && Math.abs(x2 - x) < D_PIPE_MINX; k++) x2 = 6 + Math.random() * (DOODLE_W - w - 12);
    s.platforms.push({ x: x2, y: ny + D_PIPE_DY[0] + Math.random() * (D_PIPE_DY[1] - D_PIPE_DY[0]), w, h: D_PLAT_H, type: 'pipe', pipe: id, dead: false });
  }
  p.type = type;
  return p;
}
function doodleSpawnRow(s, ny, risky) {
  const diff = Math.min(1, s.score / 700);
  const w = D_PLAT_W, x = 6 + Math.random() * (DOODLE_W - w - 12);
  let type = 'green';
  // ⚠ 9.2.5 — ACCALMIE : tant qu'une multicolore est en vie, TOUTES les bandes spéciales et
  // TOUS les dangers sont divisés par deux ; le tirage ainsi libéré retombe en plateforme
  // verte ordinaire. Seule la verte reste à taux plein — c'est le plancher de jouabilité.
  const calm = doodleRainbowAlive(s) ? D_RAINBOW_CALM : 1;
  // — saut « limite » : dalle blanche (rebond garanti mais à usage unique) + monstre qui patrouille de droite à gauche —
  // jamais deux dalles à usage unique/cassantes d'affilée → on garde toujours une plateforme solide entre deux
  if (risky && s.lastType !== 'white' && s.lastType !== 'break') {
    const p = { x, y: ny, w, h: D_PLAT_H, type: 'white', dead: false };
    s.platforms.push(p); s.lastType = 'white';
    const mx = (x + w / 2 < DOODLE_W / 2) ? DOODLE_W - 54 : 10;   // côté opposé à la dalle → évitable
    s.monsters.push({ x: mx, y: ny - 46, w: 44, h: 38, type: 1, alive: true, vx: (Math.random() < 0.5 ? -1 : 1) * (D_MOB_V + diff * D_MOB_RAMP) });
    return;
  }
  if (s.lastType !== 'break') {   // jamais deux cassantes d'affilée (garde la montée jouable)
    const r = Math.random();
    const bands = doodleBands(s.score, calm);
    const pB = bands.b, pM = bands.m, pV = bands.v;
    // ⚠ La dalle multicolore prend la part HAUTE de `r` (et non un tirage de plus) : les
    // seuils historiques break/blue/white, tous sous 0.48, restent rigoureusement inchangés.
    // Jamais deux multicolores d'affilée : deux dalles qui s'envolent à la suite rendraient
    // la montée illisible, il faut une plateforme solide entre les deux.
    // ⚠ 9.2.1 — la bande est DEUX FOIS plus étroite avant 1000 points qu'après : la dalle
    // multicolore reste un imprévu en début de montée et devient un vrai moyen d'avancer ensuite.
    // ⚠ Jamais DEUX multicolores en vie en même temps : deux échelles mobiles simultanées
    // sont illisibles, et l'accalmie perdrait son sens (elle est faite pour en isoler UNE).
    const rainbowP = (s.score >= D_RAINBOW_SCORE ? D_RAINBOW_P_HI : D_RAINBOW_P) * (1 + D_MORE_RAINBOW * doodleEarly(s.score));
    // 🎁 Coffre : MÊME taux que la multicolore, sur la bande juste en dessous de la sienne.
    // ⚠ Une bande de plus prise EN HAUT du tirage, donc sans toucher un seul des seuils
    // historiques (cassante/bleue/blanche et tuiles débloquées, tous sous 0,65).
    const chestP = doodleClassic(s) ? 0 : rainbowP * calm;
    if (r > 1 - rainbowP && s.lastType !== 'rainbow' && calm === 1) type = 'rainbow';
    else if (r > 1 - rainbowP - chestP && !D_SPECIAL.has(s.lastType)) type = 'chest';
    else if (r < pB) type = 'break';
    else if (r < pB + pM) type = 'blue';
    else if (r < pB + pM + pV) type = 'white';
    // ⚠ 9.1.8 — les tuiles débloquées prennent la bande JUSTE au-dessus de « white » (donc
    // toujours sous 0,65) et l'index se DÉDUIT de la position dans la bande : aucun tirage
    // supplémentaire, aucune séquence de Math.random décalée. « Max 1 de suite » = jamais
    // une tuile spéciale juste après une autre.
    else if (s.tiles.length && !D_SPECIAL.has(s.lastType)) {
      const lo = pB + pM + pV, band = doodleTileBand(s.score) * calm;
      if (r >= lo && r < lo + band) {
        const i = Math.min(s.tiles.length - 1, Math.floor((r - lo) / band * s.tiles.length));
        type = s.tiles[i];
      }
    }
  }
  // ⚠ 9.2.7 — La CASE BONUS prime sur tout le tirage ci-dessus : elle est DUE (un palier de
  // 1000 vient d'être franchi) et ne doit pas être repoussée de rangée en rangée par la
  // malchance. La case chance, elle, ne prend la rangée que si le tirage très rare tombe ET
  // que ses deux garde-fous le permettent : 3 par partie, 500 points d'écart minimum.
  if (s.perkPending) { type = 'perk'; s.perkPending = false; }
  else if (s.slotPending) { type = 'slot'; s.slotPending = false; }   // 🎰 due, comme la case bonus : jamais repoussée de rangée en rangée par la malchance
  else if (!doodleClassic(s) && s.luckyLeft > 0 && s.score >= s.luckyAt && !D_SPECIAL.has(s.lastType) && Math.random() < D_LUCKY_P) {
    type = 'lucky'; s.luckyLeft--; s.luckyAt = s.score + D_LUCKY_GAP;
  }
  // ☠️ Case malchance : MÊME taux et MÊMES garde-fous que la case chance, mais des compteurs
  // à elle — sinon les deux cases se voleraient leurs apparitions et on n'en verrait qu'une.
  else if (!doodleClassic(s) && s.unluckyLeft > 0 && s.score >= s.unluckyAt && !D_SPECIAL.has(s.lastType) && Math.random() < D_LUCKY_P) {
    type = 'unlucky'; s.unluckyLeft--; s.unluckyAt = s.score + D_LUCKY_GAP;
  }
  // 💀 Case cauchemardesque : MÊME taux que la case chance, mais UNE SEULE fois par partie —
  // `bossDone` est posé dès l'ouverture du combat, pas à sa fin, sinon une seconde dalle
  // pourrait naître pendant qu'on se bat.
  // ⚠ 🏅 SAUF pendant la quête ultime : elle EXIGE un boss, et le joueur qui avait déjà terrassé
  // le sien poursuivait un objectif que le jeu ne pouvait plus lui servir. La dalle redevient
  // donc possible tant que cet objectif-là n'est pas rempli, et pas une seconde de plus.
  else if (!doodleClassic(s) && (!s.bossDone || (s.ultime && doodleUltDone(s).boss < D_ULT_BOSS && !s.boss && !s.bossHide)) && s.score >= D_BOSS_FROM && !D_SPECIAL.has(s.lastType) && Math.random() < D_LUCKY_P) {
    type = 'nightmare';
  }
  // ⚠ 9.2.8 — La tuile du biome ne remplace qu'une plateforme ORDINAIRE : elle ne doit voler la
  // rangée ni à une case (due), ni à une multicolore, ni à une tuile débloquée. Et jamais deux
  // spéciales de suite, comme partout ailleurs.
  // ⚠ 10.9.5 — Le vivier est calculé AVANT le tirage, et non l'inverse : c'est lui qui donne la
  // largeur de la bande (D_BIOME_TILE_EACH par tuile). Tirer d'abord, c'était garder une bande
  // fixe partagée entre les tuiles, exactement ce que ce réglage abandonne.
  else if ((type === 'green' || type === 'blue') && !D_SPECIAL.has(s.lastType)) {
    // ⚠ 10.8.9 — Le vivier est celui du biome COURANT, et non de tous les biomes traversés.
    // Le palier précédent n'y laisse qu'UNE tuile, le vestige, et pour une part faible de la
    // bande — le reste va aux tuiles du biome où l'on se trouve.
    const tier = doodleTier(s.score);
    const pool = doodleBiomeTilesAt(s, tier), relic = doodleBiomeRelic(s, tier);
    // ⚠ Le vestige compte pour une tuile quand le vivier est vide : sans lui la bande serait
    // nulle et le vestige d'un biome sans tuile propre n'apparaîtrait jamais.
    const n = pool.length || (relic ? 1 : 0);
    if (n && Math.random() < doodleBiomeTileP(n) * calm) {
      if (relic && (!pool.length || Math.random() < D_RELIC_SHARE)) type = relic;
      else {
        // ⚠ 11.1.7 — LA RARETÉ SE JOUE APRÈS LE TIRAGE, PAS PENDANT (demande utilisateur : « −60 %
        // sur CES tuiles »). Le tirage reste UNIFORME et la bande garde exactement sa largeur ;
        // la tuile sortie n'est retenue qu'avec sa probabilité `w`, et la rangée retombe sinon en
        // plateforme ordinaire — comme le fait déjà l'accalmie de la 🌈 multicolore.
        // ⚠ Pondérer le tirage LUI-MÊME aurait reversé aux deux voisines la part retirée à la
        // rare (+7 % chacune, la bande étant plafonnée par D_BIOME_TILE_MAX) : ce n'est pas
        // « réduire une tuile », c'est en promouvoir deux autres.
        // ⚠ `Math.random() < 1` est TOUJOURS vrai (l'intervalle est ouvert à droite) : les tuiles
        // ordinaires, de poids 1, passent le filtre à tous les coups sans cas particulier.
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (Math.random() < doodleBiomeTileW(pick)) type = pick;
      }
    }
  }
  const p = { x, y: ny, w, h: D_PLAT_H, type, dead: false };
  doodleTileBirth(s, p, diff);
  type = p.type;   // 🎲 la Roulette russe a pu la ramener en verte
  // 🌈 Arc-en-ciel : elle naît avec un SECOND PIED sur la MÊME rangée — c'est entre les deux que
  // l'arc se tend. ⚠ Même ordonnée `ny` et non deux rangées, contrairement aux 🚇 Tuyaux : un
  // arc entre deux hauteurs différentes se lit comme une pente, pas comme un arc-en-ciel.
  // ⚠ 11.2.6 — Le second pied N'EST PLUS une seconde arc-en-ciel mais une vraie tuile tirée
  // dans ce que cette partie sait produire (débloquées + biomes traversés + plateformes
  // ordinaires), née par `doodleTileBirth` : son effet est donc bel et bien actif.
  // ⚠ Ni 'rbow' (elle réclamerait son propre second pied, sans fin) ni 'roulette' (elle occupe
  // TOUTE la rangée de leurres : le second pied doit rester UNE dalle).
  // ⚠ `rbChest` : la mère porte toujours le coffre. On ne pose RIEN sur le second pied — il
  // n'est plus arc-en-ciel, il ne passe donc jamais dans la boucle des coffres.
  // ⚠ `arcTo` n'est posé que sur la mère : porté par les deux, l'arc aurait été tracé deux fois
  // par frame, donc deux fois plus opaque que voulu.
  if (type === 'rbow') {
    let x2 = 6 + Math.random() * (DOODLE_W - w - 12);
    for (let k = 0; k < 14 && Math.abs(x2 - x) < D_RBOW_MINX; k++) x2 = 6 + Math.random() * (DOODLE_W - w - 12);
    const src = ['green', 'blue', ...new Set([...s.tiles, ...doodleBiomeSeen(s, doodleTier(s.score))])]
      .filter(k => k !== 'rbow' && k !== 'roulette');
    const twin = { x: x2, y: ny, w, h: D_PLAT_H, type: src[Math.floor(Math.random() * src.length)], dead: false };
    doodleTileBirth(s, twin, diff);
    p.arcTo = twin; p.rbPair = true; p.rbChest = true;
    s.platforms.push(twin);
  }
  s.platforms.push(p); s.lastType = type;
  if ((type === 'green' || type === 'blue') && !p.spring && !p.trampoline && Math.random() < 0.03) {
    const jet = Math.random() < 0.35;
    s.items.push({ x: x + w / 2 - 12, y: ny - 24, w: 24, h: 20, type: jet ? 'jet' : 'prop', taken: false });
  // ⚠ 9.2.5 — `type !== 'rainbow'` : la multicolore n'emmène JAMAIS un monstre ni un trou sur
  // sa propre ligne. On la donne à suivre, elle ne doit pas conduire droit dans un piège.
  // ⚠ 9.3.9 — JAMAIS de monstre sur la ligne d'un ressort ou d'un trampoline (demande
  // utilisateur) : ces dalles PROPULSENT bien plus haut que la portée d'un saut, donc on les
  // prend sans pouvoir viser — un monstre juste au-dessus était une mort qu'on ne pouvait pas
  // éviter. Le trou noir suit la même règle, pour la même raison.
  } else if (!D_NOMOB.has(type) && !p.spring && !p.trampoline && s.score > 60 && Math.random() < (D_MOB_P0 + diff * D_MOB_P_RAMP) * calm * D_MOB_LESS * doodleMobMore(s.score) * (s.mobRate || 1)) {   // ☯️ `mobRate` : le prix des bonus de la Yin et Yang
    s.monsters.push(doodleMakeMob(s, ny, p));   // 🪨 la dalle de la rangée : le Caillasseur s'y perche
  } else if (!D_NOMOB.has(type) && !p.spring && !p.trampoline && s.score > 350 && Math.random() < (0.015 + diff * 0.02) * calm) {
    s.holes.push({ x: 24 + Math.random() * (DOODLE_W - 48), y: ny - 22, r: 22 });
  }
}
// ⚠ 9.3.2 — RÈGLES (demande utilisateur) : tout ce que le jeu ne dit nulle part — l'effet de
// chaque dalle et de chaque butin. Les sections sont DÉRIVÉES des tables du jeu (D_TILES,
// D_BIOMES, D_LOOT, D_MALUS, D_PERKS) : ajouter une dalle l'ajoute ici, sans risque d'oubli.
// ⚠ 9.3.8 — TAUX AFFICHÉS (demande utilisateur) : ils sont CALCULÉS depuis les constantes du
// jeu, jamais recopiés à la main — un réglage modifié met les règles à jour toute seule, et il
// est impossible qu'elles finissent par mentir.
function doodlePct(x) { return (x * 100 < 1 ? (x * 100).toFixed(2) : (x * 100).toFixed(1)).replace('.', ',') + ' %'; }
function doodleLootOdds() {
  const tot = D_LOOT.reduce((a, l) => a + l.w, 0);
  return D_LOOT.map(l => ({ ...l, p: l.w / tot }));
}
function doodleRules() {
  const odds = doodleLootOdds();
  const pOf = k => doodlePct(odds.find(o => o.k === k).p);
  // Bandes au départ (score 0, renfort de début inclus) et à saturation (700 points).
  const lo = doodleBands(0, 1), hi = doodleBands(700, 1);
  return [
    { t:'Taux d\'apparition', c:'#9bd93f', rows:[
      { i:'🟩', n:'Plateformes',  d:`sur une rangée ordinaire : cassante ${doodlePct(lo.b)} à ${doodlePct(hi.b)}, bleue ${doodlePct(lo.m)} à ${doodlePct(hi.m)}, blanche ${doodlePct(lo.v)} à ${doodlePct(hi.v)} — le reste est vert. Les parts montent avec l'altitude et saturent vers 700 points ; blanche, bleue et multicolore sont en plus renforcées avant ${D_EARLY_SCORE} points.` },
      { i:'🌈', n:'Multicolore',  d:`${doodlePct(D_RAINBOW_P * (1 + D_MORE_RAINBOW * D_EARLY_MUL))} des rangées avant 1000 points, ${doodlePct(D_RAINBOW_P_HI)} au-delà. Jamais deux en vie à la fois.` },
      { i:'🎁', n:'Tuile coffre', d:'même taux que la multicolore, mais disponible dès 0 point : elle ne passe pas par les paliers de 1000.' },
      { i:'❓', n:'Case bonus',   d:`garantie à chaque palier de ${D_PERK_STEP} points — ce n'est pas un tirage.` },
      { i:'🍀', n:'Case chance',  d:`${doodlePct(D_LUCKY_P)} des rangées éligibles, ${D_LUCKY_MAX} par partie au maximum et jamais deux à moins de ${D_LUCKY_GAP} points.` },
      { i:'☠️', n:'Case malchance', d:`même taux que la case chance (${doodlePct(D_LUCKY_P)}) et mêmes garde-fous, mais comptés séparément : ${D_LUCKY_MAX} par partie au maximum et jamais deux à moins de ${D_LUCKY_GAP} points.` },
      { i:'💀', n:'Case cauchemardesque', d:`même taux que la case chance (${doodlePct(D_LUCKY_P)}), à partir de ${D_BOSS_FROM} points, UNE SEULE fois par partie.` },
      { i:'🔓', n:'Tuiles débloquées', d:`une nouvelle tous les ${D_TILE_STEP} points ; elles se partagent ensuite ${doodlePct(D_TILE_P)} des rangées.` },
      { i:'🌿', n:'Tuile de biome',    d:`${doodlePct(D_BIOME_TILE_EACH)} des rangées au tirage PAR TUILE du biome courant — soit ${doodlePct(D_BIOME_TILE_EACH * D_BIOME_TILE_SEEN)} réellement vues, le reste partant aux garde-fous : elles ne prennent qu'une rangée ordinaire, et jamais deux spéciales de suite. Une tuile par biome est volontairement RARE (🍄 Champignon, 𓂀 Égypte, 🧊 Stalactite, 🔥 Magma, 💫 Attraction, 🦑 Tentacule, ⚡ Électrifiée, ⛈️ Orage) : ${Math.round((1 - D_BIOME_TILE_RARE) * 100)} % de moins que ses deux voisines, sa rangée retombe en plateforme ordinaire ${Math.round((1 - D_BIOME_TILE_RARE) * 100)} fois sur 100, et ses deux voisines n'y gagnent rien. Au changement de biome, une seule tuile du précédent est tirée au sort et reste jouable ici — le « vestige » — pour ${doodlePct(D_RELIC_SHARE)} de cette bande, quel que soit son poids. Rien d'autre ne s'accumule d'un palier à l'autre.` },
      { i:'👾', n:'Monstres',     d:`${doodlePct(D_MOB_P0 * D_MOB_LESS)} des rangées au départ, jusqu'à ${doodlePct((D_MOB_P0 + D_MOB_P_RAMP) * D_MOB_LESS * D_MOB_MORE_HI)} vers 700 points — et ${Math.round((D_MOB_MORE_LO - 1) * 100)} % de plus entre ${D_MOB_MORE_FROM} et ${D_MOB_MORE_TO} points. Trous noirs à partir de 350 points, ${doodlePct(0.015)} à ${doodlePct(0.035)}.` },
      { i:'🐝', n:'Créature du biome', d:`parmi les monstres : ${doodlePct(D_MOB_UNCOMMON)} pour la peu rare, ${doodlePct(D_MOB_RARE)} pour la très rare (qui lâche deux coffres).` },
      { i:'👁', n:'Rôdeur',       d:`${doodlePct(D_ROAM_P)} des monstres, à partir de ${D_ROAM_FROM} points seulement.` },
      { i:'🏔️', n:'Haute altitude', d:`à partir de ${D_HIGH_FROM} points, trois créatures s'ajoutent au tirage, ${doodlePct(D_HIGH_P)} des monstres chacune. 🪨 Caillasseur : perché sur sa dalle, il lance une pierre en cloche toutes les ${Math.round(D_ROCK_GAP / 60)} s. 🦔 Hérissé : couvert de piques, ni l'écrasement ni le bélier ne l'entament — le toucher tue. 🛡️ Réflecteur : son bouclier renvoie tes tirs contre toi, et il tient aussi contre les souffles, la ☠️ Destructrice et la foudre ; seuls le 🚀 missile et le contact — lui sauter dessus ou le percuter au 🐏 bélier — en viennent à bout.` },
      { i:'📦', n:'Coffre',       d:'100 % — chaque monstre tué en lâche un. Son contenu se tire ainsi : ' + odds.map(o => `${o.icon} ${doodlePct(o.p)}`).join(' · ') + '.' },
      { i:'🎩', n:'Chapeau, jetpack', d:`${doodlePct(0.03)} des plateformes vertes et bleues sans ressort. Ressort ${doodlePct(0.09)}, trampoline ${doodlePct(0.02)}.` },
    ] },
    { t:'Plateformes', c:'#4e8f2c', rows:[
      { i:'🟩', n:'Verte',        d:'la plateforme ordinaire. Un ressort ou un trampoline peut s\'y poser et propulse bien plus haut.' },
      { i:'🟦', n:'Bleue',        d:'se déplace latéralement, sinon identique à la verte.' },
      { i:'🟫', n:'Cassante',     d:'cède au contact : elle ne renvoie pas, on la traverse.' },
      { i:'⬜', n:'Blanche',      d:'un seul rebond, puis elle disparaît. Elle marque les sauts limites.' },
      { i:'🎁', n:'Tuile coffre', d:'au premier rebond, un coffre apparaît dessus ; elle s\'éteint ensuite. Le coffre se ramasse et se tire comme celui d\'un monstre.' },
      { i:'🌈', n:'Multicolore',  d:'se téléporte plus haut à chaque rebond et tient 3 à 5 passages. Les points sur elle comptent les passages restants. Tant qu\'elle est en vie, le reste du décor se raréfie de moitié.' },
    ] },
    { t:'Cases', c:'#e0a13a', rows:[
      { i:'❓', n:'Case bonus',   d:'une par palier de 1000 points. Elle donne un bonus permanent au hasard parmi les cinq ci-dessous, puis redevient une plateforme verte.' },
      { i:'🍀', n:'Case chance',  d:`très rare (${D_LUCKY_MAX} par partie au maximum, jamais deux à moins de ${D_LUCKY_GAP} points). Elle donne un bonus permanent, et rien d'autre. Elle ne rend qu'au premier rebond mais reste une plateforme.` },
      { i:'☠️', n:'Case malchance', d:`la jumelle sombre de la case chance, aussi rare qu'elle et comptée à part. Elle donne l'un des malus ci-dessous, et rien d'autre. Elle ne frappe qu'au premier rebond mais reste une plateforme.` },
      { i:'💀', n:'Case cauchemardesque', d:`une seule par partie. Elle ouvre un combat : les dalles disparaissent, un plancher apparaît, tu ne sautes plus et tu ne fais que te déplacer et tirer — le tir y est gratuit. ${doodleBossHp(0)} points de vie (${doodleBossHp(D_BOSS_HP_HI_FROM)} au-delà de ${D_BOSS_HP_HI_FROM} points), l'un des ${D_BOSS_KINDS.length} monstres (${D_BOSS_KINDS.map(b => b.name).join(', ')}) et ses ${D_BOSS_KINDS[0].atk.length} attaques. Dès qu'il a fini un sort il se pose un bouclier qui tanque ${D_BOSS_SH} balles : brise-le pour reprendre des points de vie. Terrassé : ${D_BOSS_LOOT} trésors et une tuile neuve ; une fois les trésors ramassés, les dalles reviennent.` },
    ] },
    { t:'Bonus permanents', c:'#7b4bd0', rows: D_PERKS.map(p => ({ i:p.icon, n:p.label, d:p.txt + ' — cumulable.' })) },
    { t:'Malus de la case malchance', c:'#e2564a', rows: D_MALUS.map(m => ({ i:m.icon, n:m.label, d:m.txt + (['jam','ambush'].indexOf(m.k) < 0 ? ' — pendant environ 6 s.' : '.') })) },
    { t:'Coffres des monstres', c:'#c98b3a', rows:[
      { i:'📦', n:'Coffre',  d:'chaque monstre tué en lâche un ; il tombe et se pose sur la première plateforme. La créature très rare d\'un biome en lâche deux.' },
      ...odds.map(l => ({ i:l.icon, n:l.label, d:`${l.txt} — ${pOf(l.k)} du contenu d'un coffre, ` + (l.max === 1 ? 'une seule fois par partie.' : l.max > 1 && l.max < 99 ? `cumulable jusqu'à ${l.max}.` : 'répétable.') })),
    ] },
    { t:`Tuiles débloquées (une par palier de ${D_TILE_STEP} points)`, c:'#2f7fbf', rows: D_TILES.map(t => ({ i:t.icon, n:t.name, d:t.txt })) },
    { t:'Tuiles de biome (un biome tiré au hasard tous les 1000 points ; seul un « vestige » du précédent reste)', c:'#41b0d8', rows: D_BIOME_TILE_LIST.map(t => ({ i:t.icon, n:`${t.name} — ${t.biome.name}`, d:t.txt })) },
    { t:`Teintes de la 🖌️ Peinture fraîche (chaque dalle affiche la sienne, et ne la donne qu'une fois)`, c:'#b06fd8', rows: D_PAINTS.map(pt => ({ i:pt.icon, n:pt.name, d:pt.txt + (pt.life ? ` — ${Math.round(pt.life / 60)} s.` : ' — jusqu\'à ce qu\'elle serve.') })) },
  ];
}
// 🎰 Overlay de la machine à sous. ⚠ Les trois rouleaux s'arrêtent L'UN APRÈS L'AUTRE : trois
// arrêts simultanés ne se lisent pas comme un tirage, seulement comme un affichage.
// ⚠ Le bouton n'apparaît qu'une fois les trois arrêtés — sinon on reprend avant d'avoir vu ce
// qu'on a gagné, et la tuile n'aurait servi qu'à interrompre la partie.
const D_SLOT_STOPS = [560, 900, 1240];
// ⚠ 9.4.6 — DEUX MODES (demande utilisateur). Le mode complet s'appelle « Chaos » (9.5.2) ;
// sa clé de stockage reste `plus`, renommer une valeur déjà écrite chez l'utilisateur le
// renverrait en Classique sans qu'il ait rien demandé. En « Classique », le jeu redevient celui d'avant
// toutes les extensions : ni biome, ni créature de biome, ni rôdeur, ni case chance, ni coffre,
// ni butin, ni bouclier, ni tuile débloquée. Restent les plateformes d'origine, les monstres
// d'origine, les ressorts, le chapeau et le jetpack.
// ⚠ Le mode est lu à CHAQUE fois depuis `s.mode` et jamais recopié dans une variable de module :
// il doit pouvoir changer entre deux parties sans qu'aucun état ne traîne.
const D_MODE_LS = 'spotifyplus_doodle_mode';
function doodleModeLoad() { try { return localStorage.getItem(D_MODE_LS) === 'classic' ? 'classic' : 'plus'; } catch { return 'plus'; } }
function doodleClassic(s) { return s && s.mode === 'classic'; }
window.DOODLE_READY = true;

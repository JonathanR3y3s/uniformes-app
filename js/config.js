export const VERSION='6.8';
export const STORAGE_KEY='uniformes_assa_abloy_2026_v4';
export const TALLAS={ROPA:['XCH','CH','M','G','XG','XXG','XXXG'],PANTALON:['26','28','30','32','34','36','38','40','42','44'],CALZADO:['22','23','24','25','26','27','28','29','30','31','32','33'],UNITALLA:['UNITALLA']};
export const TIPO_TALLA={'PLAYERA POLO TIPO A':'ROPA','PLAYERA POLO TIPO B':'ROPA','CAMISOLA':'ROPA','CHALECO':'ROPA','PLAYERA PANTS':'ROPA','PANTS':'ROPA','CHAMARRA':'ROPA','PANTALON':'PANTALON','ZAPATO NORMAL':'CALZADO','ZAPATO ESPECIAL':'CALZADO','ZAPATO SEGURIDAD':'CALZADO','BOTA':'CALZADO','CHOCLO':'CALZADO','TENIS':'CALZADO','SANDALIAS':'CALZADO','TOALLA':'UNITALLA','TERMO':'UNITALLA','GORRA':'UNITALLA','SOMBRILLA':'UNITALLA'};
export const REGLAS={
'PLANTA':{prendas:['PLAYERA POLO TIPO A','PANTALON','BOTA_O_CHOCLO','PLAYERA PANTS','PANTS','TENIS','CHALECO_O_CHAMARRA','TOALLA','TERMO','GORRA','SOMBRILLA','SANDALIAS'],cantidades:{'PLAYERA POLO TIPO A':3,'PANTALON':3,'BOTA_O_CHOCLO':1,'PLAYERA PANTS':1,'PANTS':1,'TENIS':1,'CHALECO_O_CHAMARRA':1,'TOALLA':2,'TERMO':1,'GORRA':1,'SOMBRILLA':1,'SANDALIAS':1},opciones:{'BOTA_O_CHOCLO':['BOTA','CHOCLO'],'CHALECO_O_CHAMARRA':['CHALECO','CHAMARRA']},usaTallaZapatos:['SANDALIAS']},
'MATERIA PRIMA':{prendas:['PLAYERA POLO TIPO B','PANTALON','BOTA'],cantidades:{'PLAYERA POLO TIPO B':2,'PANTALON':2,'BOTA':1}},
'TULTITLAN':{prendas:['PLAYERA POLO TIPO B','PANTALON','BOTA'],cantidades:{'PLAYERA POLO TIPO B':2,'PANTALON':2,'BOTA':1}},
'MANTENIMIENTO':{prendas:['CAMISOLA','PANTALON','ZAPATO ESPECIAL'],cantidades:{'CAMISOLA':2,'PANTALON':2,'ZAPATO ESPECIAL':1}},
'TALLER MECANICO':{prendas:['CAMISOLA','PANTALON','ZAPATO_NORMAL_O_ESPECIAL'],cantidades:{'CAMISOLA':2,'PANTALON':2,'ZAPATO_NORMAL_O_ESPECIAL':1},opciones:{'ZAPATO_NORMAL_O_ESPECIAL':['BOTA','CHOCLO','ZAPATO ESPECIAL']}},
'PUERTAS':{prendas:['CAMISOLA','PANTALON','BOTA'],cantidades:{'CAMISOLA':2,'PANTALON':2,'BOTA':1}},
'BRUKEN':{prendas:['PLAYERA POLO TIPO B','PANTALON','BOTA','CHALECO'],cantidades:{'PLAYERA POLO TIPO B':2,'PANTALON':2,'BOTA':1,'CHALECO':1}},
'SUPERVISORES':{prendas:[],cantidades:{},esFlexible:true,prendasDisponibles:['BOTA','CHOCLO','ZAPATO ESPECIAL','PANTALON','PLAYERA POLO TIPO A','PLAYERA POLO TIPO B','CAMISOLA','CHALECO']}
};
export const PERFILES={
'AUTO':null,
'PLANTA_SINDICALIZADO':{prendas:['CAMISOLA','PANTALON','BOTA_O_CHOCLO','PLAYERA PANTS','PANTS','TENIS','CHALECO_O_CHAMARRA','TOALLA','TERMO','GORRA','SOMBRILLA','SANDALIAS'],cantidades:{'CAMISOLA':3,'PANTALON':3,'BOTA_O_CHOCLO':1,'PLAYERA PANTS':1,'PANTS':1,'TENIS':1,'CHALECO_O_CHAMARRA':1,'TOALLA':2,'TERMO':1,'GORRA':1,'SOMBRILLA':1,'SANDALIAS':1},opciones:{'BOTA_O_CHOCLO':['BOTA','CHOCLO'],'CHALECO_O_CHAMARRA':['CHALECO','CHAMARRA']},usaTallaZapatos:['SANDALIAS']},
'PUERTAS_NO_SINDICALIZADO':null
};
export const CATEGORIAS={'BOTA':'CALZADO','CHOCLO':'CALZADO','ZAPATO ESPECIAL':'CALZADO','TENIS':'CALZADO','SANDALIAS':'CALZADO','PLAYERA POLO TIPO A':'ROPA','PLAYERA POLO TIPO B':'ROPA','PLAYERA PANTS':'ROPA','PANTALON':'ROPA','PANTS':'ROPA','CAMISOLA':'ROPA','CHALECO':'ROPA','CHAMARRA':'ROPA','GORRA':'ACCESORIOS','TERMO':'ACCESORIOS','TOALLA':'ACCESORIOS','SOMBRILLA':'ACCESORIOS'};
export const NAV=[
{section:'OPERACIÓN'},
{id:'dashboard',icon:'fa-chart-pie',label:'Dashboard'},
{id:'empleados',icon:'fa-users',label:'Empleados'},
{id:'captura',icon:'fa-user-edit',label:'Captura de Tallas'},
{id:'entregas',icon:'fa-hand-holding',label:'Entrega de Uniformes'},
{id:'entrega-sku',icon:'fa-box-open',label:'Entrega SKU'},
{id:'campanias',icon:'fa-calendar-check',label:'Campañas'},
{section:'ALMACÉN'},
{id:'inventario',icon:'fa-boxes',label:'Inventario'},
{id:'inventario-sku',icon:'fa-barcode',label:'Inventario SKU'},
{id:'devolucion-sku',icon:'fa-undo',label:'Devoluciones'},
{id:'stock-uniformes',icon:'fa-tshirt',label:'Stock Uniformes'},
{id:'proveedores',icon:'fa-truck',label:'Proveedores'},
{id:'salidas',icon:'fa-sign-out-alt',label:'Salidas de Almacén'},
{section:'REPORTES'},
{id:'tablero',icon:'fa-th-large',label:'Tablero Maestro'},
{id:'totales',icon:'fa-calculator',label:'Totales'},
{id:'centro-costos',icon:'fa-chart-line',label:'Control Financiero'},
{id:'exportar',icon:'fa-file-export',label:'Exportar'},
{section:'SISTEMA'},
{id:'areas',icon:'fa-layer-group',label:'Áreas y Dotaciones'},
{id:'usuarios',icon:'fa-user-shield',label:'Usuarios'},
{id:'bitacora',icon:'fa-clipboard-list',label:'Bitácora'},
{id:'importar',icon:'fa-file-import',label:'Importar Excel'},
{id:'config',icon:'fa-cog',label:'Configuración'}
];

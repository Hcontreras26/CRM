import router from './expense.routes.js';

// Egresos, igual en los dos CRM (#227). MultiCRM los servía en
// /api/accounting/expenses y CRM-ISEIE en /api/expenses: queda esta última y la
// otra sigue respondiendo como alias, porque los comprobantes ya subidos en
// MultiCRM guardaron esa dirección.
export default {
  prefix: '/api/expenses',
  alias: '/api/accounting/expenses',
  router,
};

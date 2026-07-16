# ExportFlow – Export Order Management System

Sistema completo de gestão de pedidos de exportação.

## 📁 Estrutura

```
/sistema-pedidos
  /backend
    - server.js       → API REST Express (porta 3001)
    - database.js     → Configuração do SQLite
    - package.json
  /frontend
    - App.jsx         → React App (componente raiz)
    - index.html
    - vite.config.js
    - package.json
    /src
      - main.jsx      → Entry point React
```

## 🚀 Como rodar

### Backend

```bash
cd backend
npm install
npm run dev      # ou: npm start
```

O servidor sobe em → **http://localhost:3001**

### Frontend

```bash
cd frontend
npm install
npm run dev
```

O app abre em → **http://localhost:5173**

---

## 🧩 Módulos

| Módulo | Descrição |
|--------|-----------|
| **Dashboard** | Estatísticas em tempo real por status, resumo financeiro |
| **Orders** | Cadastro/edição de pedidos, numeração editável, troca de status |
| **Products** | Catálogo de produtos com código, custo, preço e margem |
| **Samples** | Controle de amostras por status de desenvolvimento |
| **Proformas** | Proforma invoice por cliente |
| **Contracts** | Contratos com fornecedores |
| **Client Flow** | Fluxo financeiro – recebimentos de clientes |
| **Supplier Flow** | Fluxo financeiro – pagamentos a fornecedores |

## 📡 API Endpoints

```
GET    /api/dashboard
GET    /api/orders
POST   /api/orders
PUT    /api/orders/:id
PATCH  /api/orders/:id/status
DELETE /api/orders/:id

GET    /api/products
POST   /api/products
PUT    /api/products/:id
DELETE /api/products/:id

GET    /api/samples
POST   /api/samples
PATCH  /api/samples/:id/status
DELETE /api/samples/:id

GET    /api/proformas
POST   /api/proformas
PUT    /api/proformas/:id
DELETE /api/proformas/:id

GET    /api/contracts
POST   /api/contracts
PUT    /api/contracts/:id
DELETE /api/contracts/:id

GET    /api/financial/clients
POST   /api/financial/clients
PATCH  /api/financial/clients/:id/status
DELETE /api/financial/clients/:id

GET    /api/financial/suppliers
POST   /api/financial/suppliers
PATCH  /api/financial/suppliers/:id/status
DELETE /api/financial/suppliers/:id
```

## 🗄️ Banco de dados

SQLite (arquivo `pedidos.db` criado automaticamente na pasta `/backend`).
Tabelas: `orders`, `order_items`, `products`, `samples`, `proformas`, `supplier_contracts`, `financial_clients`, `financial_suppliers`.

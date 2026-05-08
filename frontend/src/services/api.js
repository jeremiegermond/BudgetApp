import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Transactions
export const getTransactions   = (params)    => api.get('/transactions', { params })
export const createTransaction = (data)      => api.post('/transactions', data)
export const updateTransaction = (id, data)  => api.patch(`/transactions/${id}`, data)
export const deleteTransaction = (id)        => api.delete(`/transactions/${id}`)
export const importCSV         = (file)      => { const f = new FormData(); f.append('file', file); return api.post('/transactions/import', f) }

// Categories
export const getCategories   = ()      => api.get('/categories')
export const createCategory  = (data)  => api.post('/categories', data)
export const updateCategory  = (id, d) => api.patch(`/categories/${id}`, d)
export const deleteCategory  = (id)    => api.delete(`/categories/${id}`)

// Budget
export const getBudget        = (month) => api.get('/budget', { params: { month } })
export const setBudgetItem    = (data)  => api.post('/budget', data)
export const deleteBudgetItem = (id)    => api.delete(`/budget/${id}`)

// Bank (Woob)
export const getBankBackends      = ()       => api.get('/bank/backends')
export const getBankConnections   = ()       => api.get('/bank/connections')
export const checkBankCredentials = (data)   => api.post('/bank/check', data)
export const connectBank          = (data)   => api.post('/bank/connect', data)
export const syncBank             = (id)     => api.post(`/bank/sync/${id}`)
export const disconnectBank       = (id)     => api.delete(`/bank/connection/${id}`)

// Recurring payments
export const getRecurring          = ()         => api.get('/recurring')
export const createRecurring       = (data)     => api.post('/recurring', data)
export const updateRecurring       = (id, data) => api.patch(`/recurring/${id}`, data)
export const deleteRecurring       = (id)       => api.delete(`/recurring/${id}`)
export const getRecurringForecast  = (month)    => api.get(`/recurring/forecast/${month}`)
export const autoCategorize        = (month)    => api.post('/recurring/auto-categorize', { month })

// Bank (Enable Banking)
export const getEBBanks         = ()         => api.get('/bank/eb/banks')
export const startEBAuth        = (data)     => api.post('/bank/eb/start-auth', data)
export const completeEBAuth     = (data)     => api.post('/bank/eb/complete-auth', data)
export const getEBConnections   = ()         => api.get('/bank/eb/connections')
export const disconnectEBBank   = (id)       => api.delete(`/bank/eb/connection/${id}`)
export const getEBConfig        = ()         => api.get('/bank/eb/config')
export const setEBConfig        = (data)     => api.post('/bank/eb/config', data)
export const clearEBConfig      = ()         => api.delete('/bank/eb/config')

export default api

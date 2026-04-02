import { dbModel } from '../model/dbModel.js';

/**
 * AdminService
 * Gerencia a lógica de relatórios operacionais e de faturamento.
 */
class AdminService {
    constructor() {
        this.SHIFT_HOURS = {
            'Manhã': 6,
            'Tarde': 6,
            'Noite': 5,
            'Madrugada': 6
        };
    }

    /**
     * Gera o relatório de produtividade com cálculo de horas.
     */
    async getProductivityReport(filters) {
        const rows = await dbModel.getAdminProductivityReport(filters);
        
        const processedRows = rows.map(row => ({
            data: row.data_plantao,
            unidade: row.unidades?.nome || 'N/A',
            medico: row.medicos?.nome || 'N/A',
            crm: row.medicos?.crm || 'N/A',
            turno: row.turno,
            horas: this.SHIFT_HOURS[row.turno] || 0
        }));

        return processedRows;
    }

    /**
     * Gera o relatório de trocas efetuadas.
     */
    async getExchangesReport(filters) {
        const rows = await dbModel.getAdminExchangesReport(filters);
        return rows.map(row => ({
            data: row.data_plantao,
            unidade: row.unidades?.nome || 'N/A',
            solicitante: row.medico_solicitante?.nome || 'N/A',
            alvo: row.medico_alvo?.nome || 'N/A',
            turno: row.turno,
            status: row.status
        }));
    }

    /**
     * Gera o relatório de cancelamentos.
     */
    async getCancellationsReport(filters) {
        const rows = await dbModel.getAdminCancellationsReport(filters);
        return rows.map(row => ({
            data_solicitacao: new Date(row.created_at).toLocaleDateString('pt-BR'),
            unidade: row.unidades?.nome || 'N/A',
            medico: row.medicos?.nome || 'N/A',
            motivo: row.motivo || 'N/A',
            status: row.status
        }));
    }

    /**
     * Converte um array de objetos para CSV (UTF-8 com BOM para Excel).
     */
    convertToCSV(data) {
        if (!data || data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(';')];

        for (const row of data) {
            const values = headers.map(header => {
                const val = row[header];
                return `"${String(val).replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(';'));
        }

        // Adiciona BOM para o Excel reconhecer acentos
        return '\ufeff' + csvRows.join('\n');
    }

    /**
     * Formata os dados em uma tabela HTML simples.
     */
    formatHTMLTable(data) {
        if (!data || data.length === 0) return '<p>Nenhum dado encontrado.</p>';

        const headers = Object.keys(data[0]);
        let html = '<table border="1" style="border-collapse: collapse; width: 100%; font-family: sans-serif;">';
        
        // Header
        html += '<tr style="background-color: #f2f2f2;">';
        headers.forEach(h => html += `<th style="padding: 8px; text-align: left;">${h.toUpperCase()}</th>`);
        html += '</tr>';

        // Body
        data.forEach(row => {
            html += '<tr>';
            headers.forEach(h => html += `<td style="padding: 8px;">${row[h]}</td>`);
            html += '</tr>';
        });

        html += '</table>';
        return html;
    }
}

export const adminService = new AdminService();

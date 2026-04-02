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
     * Gera o relatório de produtividade completo (para download).
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
     * Retorna apenas o resumo agregado por médico (para exibição na tela).
     * Não retorna linhas brutas, garantindo performance com grandes volumes.
     */
    async getProductivitySummary(filters) {
        const rows = await dbModel.getAdminProductivityReport(filters);

        const byDoctor = new Map();

        for (const row of rows) {
            const medicoId = row.medicos?.id || 'desconhecido';
            const medicoNome = row.medicos?.nome || 'N/A';
            const crm = row.medicos?.crm || 'N/A';
            const unidade = row.unidades?.nome || 'N/A';
            const horas = this.SHIFT_HOURS[row.turno] || 0;

            if (!byDoctor.has(medicoId)) {
                byDoctor.set(medicoId, {
                    medico: medicoNome,
                    crm,
                    unidades: new Set(),
                    plantoes: 0,
                    horas: 0
                });
            }

            const entry = byDoctor.get(medicoId);
            entry.unidades.add(unidade);
            entry.plantoes += 1;
            entry.horas += horas;
        }

        const porMedico = Array.from(byDoctor.values())
            .map(e => ({ ...e, unidades: [...e.unidades].join(', ') }))
            .sort((a, b) => b.horas - a.horas);

        const totalHoras = porMedico.reduce((s, e) => s + e.horas, 0);

        return {
            totalRegistros: rows.length,
            totalHoras,
            porMedico
        };
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
     * O consolidado por médico vai no INÍCIO, antes dos dados brutos.
     */
    convertToCSV(data) {
        if (!data || data.length === 0) return '';

        const csvRows = [];

        // --- BLOCO CONSOLIDADO NO INÍCIO (somente para produtividade) ---
        if (data[0] && 'horas' in data[0] && 'medico' in data[0]) {
            const byDoctor = new Map();
            for (const row of data) {
                const key = row.medico || 'N/A';
                if (!byDoctor.has(key)) byDoctor.set(key, { plantoes: 0, horas: 0 });
                const e = byDoctor.get(key);
                e.plantoes += 1;
                e.horas += Number(row.horas) || 0;
            }
            const totalHoras = data.reduce((s, r) => s + (Number(r.horas) || 0), 0);
            const sorted = [...byDoctor.entries()].sort((a, b) => b[1].horas - a[1].horas);

            csvRows.push(`"RELATÓRIO DE PRODUTIVIDADE — Total de Registros: ${data.length}"`);
            csvRows.push('');
            csvRows.push('"--- CONSOLIDADO POR MÉDICO ---"');
            csvRows.push('"Médico";"Total Plantões";"Total Horas"');
            for (const [nome, e] of sorted) {
                csvRows.push(`"${nome}";"${e.plantoes}";"${e.horas}h"`);
            }
            csvRows.push(`"TOTAL GERAL";"${sorted.reduce((s, [, e]) => s + e.plantoes, 0)}";"${totalHoras}h"`);
            csvRows.push('');
            csvRows.push('"--- DADOS BRUTOS ---"');
        }

        // --- DADOS BRUTOS ---
        const headers = Object.keys(data[0]);
        csvRows.push(headers.join(';'));
        for (const row of data) {
            const values = headers.map(header => {
                const val = row[header];
                return `"${String(val).replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(';'));
        }

        // BOM para o Excel reconhecer acentos
        return '\ufeff' + csvRows.join('\n');
    }

    /**
     * Formata os dados em uma tabela HTML.
     * O consolidado por médico vai no INÍCIO, antes dos dados brutos.
     */
    formatHTMLTable(data) {
        if (!data || data.length === 0) return '<p>Nenhum dado encontrado.</p>';

        const headers = Object.keys(data[0]);
        const tdStyle = 'padding:8px;border:1px solid #ddd;font-size:13px;';
        const thStyle = 'padding:8px;border:1px solid #bbb;background:#e8e8e8;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em;';

        let html = `<html><head><meta charset="utf-8"><title>Relatório</title></head><body style="font-family:sans-serif;padding:20px;">`;
        html += `<h2 style="color:#4c1d95;">Relatório de Produtividade</h2>`;
        html += `<p style="color:#555;font-size:12px;">Total de registros: <strong>${data.length}</strong></p>`;

        // --- CONSOLIDADO NO INÍCIO ---
        if (data[0] && 'horas' in data[0] && 'medico' in data[0]) {
            const byDoctor = new Map();
            for (const row of data) {
                const key = row.medico || 'N/A';
                if (!byDoctor.has(key)) byDoctor.set(key, { plantoes: 0, horas: 0 });
                const e = byDoctor.get(key);
                e.plantoes += 1;
                e.horas += Number(row.horas) || 0;
            }
            const totalHoras = data.reduce((s, r) => s + (Number(r.horas) || 0), 0);
            const sorted = [...byDoctor.entries()].sort((a, b) => b[1].horas - a[1].horas);

            html += `<h3 style="color:#4c1d95;margin-top:8px;margin-bottom:8px;">Consolidado por Médico</h3>`;
            html += `<table style="border-collapse:collapse;width:100%;margin-bottom:32px;">`;
            html += `<tr><th style="${thStyle}">Médico</th><th style="${thStyle}">Total Plantões</th><th style="${thStyle}">Total Horas</th></tr>`;
            sorted.forEach(([nome, e], i) => {
                html += `<tr style="background:${i % 2 === 0 ? '#fff' : '#f9f9ff'}"><td style="${tdStyle}">${nome}</td><td style="${tdStyle}">${e.plantoes}</td><td style="${tdStyle}">${e.horas}h</td></tr>`;
            });
            html += `<tr style="background:#ede9fe;font-weight:bold;"><td style="${tdStyle}">TOTAL GERAL</td><td style="${tdStyle}">${sorted.reduce((s, [, e]) => s + e.plantoes, 0)}</td><td style="${tdStyle}">${totalHoras}h</td></tr>`;
            html += '</table>';
        }

        // --- DADOS BRUTOS ---
        html += `<h3 style="color:#374151;margin-top:0;margin-bottom:8px;">Dados Brutos</h3>`;
        html += `<table style="border-collapse:collapse;width:100%;margin-bottom:32px;">`;
        html += '<tr>';
        headers.forEach(h => html += `<th style="${thStyle}">${h}</th>`);
        html += '</tr>';
        data.forEach((row, i) => {
            html += `<tr style="background:${i % 2 === 0 ? '#fff' : '#f9f9ff'}">`;
            headers.forEach(h => html += `<td style="${tdStyle}">${row[h] ?? ''}</td>`);
            html += '</tr>';
        });
        html += '</table>';

        html += '</body></html>';
        return html;
    }
}

export const adminService = new AdminService();

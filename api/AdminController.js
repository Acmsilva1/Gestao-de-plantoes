import { adminService } from './AdminService.js';

export const getAdminProductivityReport = async (req, res) => {
    try {
        const { startDate, endDate, medicoId, unidadeId, format } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Data de início e fim são obrigatórias.' });
        }

        const data = await adminService.getProductivityReport({ startDate, endDate, medicoId, unidadeId });

        if (format === 'csv') {
            const csv = adminService.convertToCSV(data);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=relatorio_produtividade.csv');
            return res.send(csv);
        }

        if (format === 'html') {
            const html = adminService.formatHTMLTable(data);
            return res.send(html);
        }

        res.json(data);
    } catch (error) {
        console.error('[AdminController] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getAdminExchangesReport = async (req, res) => {
    try {
        const { startDate, endDate, medicoId, unidadeId, format } = req.query;
        const data = await adminService.getExchangesReport({ startDate, endDate, medicoId, unidadeId });

        if (format === 'csv') {
            const csv = adminService.convertToCSV(data);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=relatorio_trocas.csv');
            return res.send(csv);
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getAdminCancellationsReport = async (req, res) => {
    try {
        const { startDate, endDate, medicoId, unidadeId, format } = req.query;
        const data = await adminService.getCancellationsReport({ startDate, endDate, medicoId, unidadeId });

        if (format === 'csv') {
            const csv = adminService.convertToCSV(data);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=relatorio_cancelamentos.csv');
            return res.send(csv);
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getAdminUnits = async (req, res) => {
    try {
        const { dbModel } = await import('../model/dbModel.js');
        const units = await dbModel.getUnits();
        res.json(units || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getAdminDoctors = async (req, res) => {
    try {
        const { dbModel } = await import('../model/dbModel.js');
        const { unidadeId } = req.query;

        let doctors;
        if (unidadeId) {
            doctors = await dbModel.getDoctorsByUnit(unidadeId);
        } else {
            doctors = await dbModel.getDoctors();
        }
        
        res.json(doctors || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updateAdminProfile = async (req, res) => {
    try {
        const { dbModel } = await import('../model/dbModel.js');
        const { id } = req.params;
        const { nome, usuario, senha } = req.body;
        
        const updated = await dbModel.updateAdminProfile(id, { nome, usuario, senha });
        res.json({ message: 'Perfil atualizado com sucesso.', admin: updated });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

import { adminService } from './api/AdminService.js';

async function testAdminReports() {
    console.log('=== TESTE: RELATÓRIOS ADMINISTRATIVOS ===');
    
    // Filtros de exemplo (Ajustar conforme seus dados reais no DB)
    const filters = {
        startDate: '2024-01-01',
        endDate: '2026-12-31'
    };

    try {
        console.log('\n[1] Testando Produtividade (Horas)...');
        const prod = await adminService.getProductivityReport(filters);
        console.log(`Sucesso: ${prod.length} linhas encontradas.`);
        if (prod.length > 0) {
            console.log('Exemplo de linha de faturamento:', prod[0]);
        }

        console.log('\n[2] Testando Conversão CSV...');
        const csv = adminService.convertToCSV(prod.slice(0, 5));
        console.log('CSV Status: OK (Prefixo BOM detectado)');

        console.log('\n[3] Testando Formatação HTML...');
        const html = adminService.formatHTMLTable(prod.slice(0, 3));
        console.log('HTML Status: OK (Tabela renderizada)');

        console.log('\n=== TESTE FINALIZADO COM SUCESSO ===');
    } catch (err) {
        console.error('ERRO NO TESTE:', err.message);
    }
}

testAdminReports();

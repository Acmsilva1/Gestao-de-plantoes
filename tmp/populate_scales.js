import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function populateRedistributed() {
    try {
        console.log('--- Iniciando redistribuição das escalas (Abril e Maio) ---');
        
        // 1. Limpar dados existentes para o período
        console.log('Limpando dados de Abril e Maio...');
        await supabase.from('escala').delete().gte('data_plantao', '2026-04-01').lte('data_plantao', '2026-05-31');
        await supabase.from('disponibilidade').delete().gte('data_plantao', '2026-04-01').lte('data_plantao', '2026-05-31');

        const { data: units } = await supabase.from('unidades').select('id, nome');
        const { data: doctors } = await supabase.from('medicos').select('id, nome');
        
        if (!units || !units.length || !doctors || !doctors.length) {
            console.error('Unidades ou médicos não encontrados.');
            return;
        }

        const shifts = ['Manhã', 'Tarde', 'Noite', 'Madrugada'];
        const startDate = new Date('2026-04-01');
        const endDate = new Date('2026-05-31');
        
        const availabilityToInsert = [];
        const scaleToInsert = [];
        const doctorAssignments = {}; // { doctorId: Set(dateStr + shift) }

        // Logic to distribute: for each unit and day, decide occupancy
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            
            for (const unit of units) {
                // Determine how many slots to fill for THIS unit on THIS day
                // To get ~70% of 4 shifts (2.8 shifts), we vary between 2 and 4.
                // 25% chance of 2 fills, 50% chance of 3 fills, 25% chance of 4 fills.
                const rand = Math.random();
                let fillsNeeded = 3;
                if (rand < 0.25) fillsNeeded = 2;
                else if (rand > 0.75) fillsNeeded = 4;

                const dayShifts = [...shifts].sort(() => 0.5 - Math.random());
                
                for (let i = 0; i < shifts.length; i++) {
                    const shift = shifts[i];
                    const isOccupied = dayShifts.slice(0, fillsNeeded).includes(shift);
                    
                    availabilityToInsert.push({
                        unidade_id: unit.id,
                        data_plantao: dateStr,
                        turno: shift,
                        vagas_totais: 1,
                        vagas_ocupadas: isOccupied ? 1 : 0,
                        status: isOccupied ? 'OCUPADO' : 'ABERTO'
                    });

                    if (isOccupied) {
                        const assignmentKey = `${dateStr}|${shift}`;
                        // Try to find a doctor not assigned to this (date|shift) yet
                        const shuffledDoctors = [...doctors].sort(() => 0.5 - Math.random());
                        let assignedDoctor = null;

                        for (const doctor of shuffledDoctors) {
                            if (!doctorAssignments[doctor.id]) doctorAssignments[doctor.id] = new Set();
                            if (!doctorAssignments[doctor.id].has(assignmentKey)) {
                                assignedDoctor = doctor;
                                doctorAssignments[doctor.id].add(assignmentKey);
                                break;
                            }
                        }

                        if (assignedDoctor) {
                            scaleToInsert.push({
                                unidade_id: unit.id,
                                medico_id: assignedDoctor.id,
                                data_plantao: dateStr,
                                turno: shift
                            });
                        }
                    }
                }
            }
        }

        console.log(`Gerando ${availabilityToInsert.length} registros de disponibilidade...`);
        for (let i = 0; i < availabilityToInsert.length; i += 200) {
            const chunk = availabilityToInsert.slice(i, i + 200);
            await supabase.from('disponibilidade').insert(chunk);
        }

        console.log(`Inserindo ${scaleToInsert.length} alocações na escala...`);
        for (let i = 0; i < scaleToInsert.length; i += 200) {
            const chunk = scaleToInsert.slice(i, i + 200);
            await supabase.from('escala').insert(chunk);
        }

        const globalOccupancy = Math.round((scaleToInsert.length / availabilityToInsert.length) * 100);
        console.log(`--- Sucesso! Simulação redistribuída com ${scaleToInsert.length} plantões ocupados (${globalOccupancy}%). ---`);

    } catch (e) {
        console.error(e);
    }
}
populateRedistributed();

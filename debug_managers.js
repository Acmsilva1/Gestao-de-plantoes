
import { dbModel } from './model/dbModel.js';
import { env } from './config/env.js';

async function test() {
    console.log('Testing dbModel.listManagerProfiles()...');
    try {
        const profiles = await dbModel.listManagerProfiles();
        console.log('Success! Found profiles:', profiles.length);
        profiles.forEach(p => console.log(`- ${p.nome} (${p.usuario})`));
    } catch (err) {
        console.error('Error in listManagerProfiles:', err.message);
    }

    console.log('\nTesting dbModel.ensureManagersPerUnit()...');
    try {
        const managers = await dbModel.ensureManagersPerUnit();
        console.log('Success! Found managers after ensure:', managers.length);
    } catch (err) {
        console.error('Error in ensureManagersPerUnit:', err.message);
    }
}

test();

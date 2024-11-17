import { Unit, Position, UnitConfig, CombatResult } from './types';

export class CombatManager {
    private readonly UNIT_CONFIGS: Record<string, UnitConfig> = {
        'WARRIOR': {
            type: 'WARRIOR',
            maxHealth: 100,
            attackStrength: 30,
            range: 1,
            movementPoints: 2
        },
        'ARCHER': {
            type: 'ARCHER',
            maxHealth: 100,
            attackStrength: 25,
            range: 2,
            movementPoints: 2
        },
        'SETTLER': {
            type: 'SETTLER',
            maxHealth: 100,
            attackStrength: 0,
            range: 0,
            movementPoints: 2
        }
    };

    private readonly BASE_XP_GAIN = 20;
    private readonly XP_PER_LEVEL = 100;
    private readonly DAMAGE_VARIANCE = 0.2; // ±20% damage variance

    public createUnit(type: string, ownerId: string, position: Position): Unit {
        const config = this.UNIT_CONFIGS[type];
        return {
            id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type,
            position,
            ownerId,
            maxHealth: config.maxHealth,
            currentHealth: config.maxHealth,
            attackStrength: config.attackStrength,
            range: config.range,
            movementPoints: config.movementPoints,
            maxMovementPoints: config.movementPoints,
            level: 1,
            experience: 0
        };
    }

    public resolveCombat(attacker: Unit, defender: Unit): CombatResult {
        // Store initial levels
        const initialAttackerLevel = attacker.level;
        const initialDefenderLevel = defender.level;

        // Calculate base damages
        let attackerDamage = this.calculateDamage(attacker.attackStrength, attacker.level);
        let defenderDamage = defender.range === 0 ? 0 : this.calculateDamage(defender.attackStrength, defender.level);

        // No retaliation for archer attacks
        if (attacker.type === 'ARCHER') {
            defenderDamage = 0;
        }

        // Apply damage
        defender.currentHealth -= attackerDamage;
        attacker.currentHealth -= defenderDamage;

        // Determine if any unit died (only one can die)
        let attackerDied = false;
        let defenderDied = false;

        if (defender.currentHealth <= 0 && attacker.currentHealth <= 0) {
            // If both would die, randomly choose one to survive with 1 HP
            if (Math.random() < 0.5) {
                defender.currentHealth = 1;
                attackerDied = true;
            } else {
                attacker.currentHealth = 1;
                defenderDied = true;
            }
        } else {
            attackerDied = attacker.currentHealth <= 0;
            defenderDied = defender.currentHealth <= 0;
        }

        // Calculate and apply experience
        const experienceGained = this.calculateExperience(attackerDied || defenderDied);
        const attackerLevelUp = !attackerDied ? this.applyExperience(attacker, experienceGained) : null;
        const defenderLevelUp = !defenderDied ? this.applyExperience(defender, experienceGained) : null;

        return {
            attackerDamage,
            defenderDamage,
            attackerDied,
            defenderDied,
            experienceGained,
            attackerLevelUp,
            defenderLevelUp,
            initialAttackerLevel,
            initialDefenderLevel
        };
    }

    private calculateDamage(baseStrength: number, level: number): number {
        const levelBonus = (level - 1) * 0.1; // 10% damage increase per level
        const baseDamage = baseStrength * (1 + levelBonus);
        const variance = baseDamage * this.DAMAGE_VARIANCE;
        return Math.round(baseDamage + (Math.random() * variance * 2 - variance));
    }

    private calculateExperience(unitDied: boolean): number {
        return this.BASE_XP_GAIN * (unitDied ? 2 : 1);
    }

    private applyExperience(unit: Unit, xp: number): { levelGained: boolean, newLevel?: number } {
        unit.experience += xp;
        let levelGained = false;
        let newLevel;

        while (unit.experience >= this.XP_PER_LEVEL) {
            unit.experience -= this.XP_PER_LEVEL;
            unit.level++;
            newLevel = unit.level;
            levelGained = true;
            unit.maxHealth += 10;
            unit.currentHealth = unit.maxHealth;
            unit.attackStrength += 5;
        }

        return { levelGained, newLevel };
    }
}
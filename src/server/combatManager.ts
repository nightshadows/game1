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
        const initialAttackerLevel = attacker.level;
        const initialDefenderLevel = defender.level;

        // Remove fortification status when attacking
        if (attacker.fortified) {
            attacker.fortified = false;
        }

        // Calculate damage with fortification bonus
        const attackerDamage = this.calculateDamage(attacker, defender);
        const defenderDamage = this.canCounterAttack(attacker, defender) ?
            this.calculateDamage(defender, attacker) : 0;

        // Apply damage
        defender.currentHealth -= attackerDamage;
        if (defenderDamage > 0) {
            attacker.currentHealth -= defenderDamage;
        }

        // Check for deaths
        const attackerDied = attacker.currentHealth <= 0;
        const defenderDied = defender.currentHealth <= 0;

        // Calculate experience gained for both units
        let attackerXP = 0;
        let defenderXP = 0;

        // Award XP for dealing damage
        if (attacker.ownerId === 'player1') {
            attackerXP = Math.ceil(attackerDamage * 0.5); // 0.5 XP per point of damage dealt
            if (defenderDied) {
                attackerXP += 20; // Bonus XP for defeating an enemy
            }
            attacker.experience += attackerXP;
        }

        // Award XP for defending and counter-attacking
        if (defender.ownerId === 'player1' && !defenderDied) {
            defenderXP = Math.ceil(defenderDamage * 0.5); // 0.5 XP per point of damage dealt
            if (attackerDied) {
                defenderXP += 20; // Bonus XP for defeating an enemy
            }
            defender.experience += defenderXP;
        }

        return {
            attackerDamage,
            defenderDamage,
            attackerDied,
            defenderDied,
            attackerXP,    // New field
            defenderXP,    // New field
            attackerLevelUp: null,
            defenderLevelUp: null,
            initialAttackerLevel,
            initialDefenderLevel
        };
    }

    private calculateDamage(attacker: Unit, defender: Unit): number {
        let attackStrength = attacker.attackStrength;

        // Add fortification bonus for defending units
        if (defender.fortified) {
            attackStrength -= 5;  // Reduce incoming damage by 5
        }

        // Ensure minimum damage of 1
        const damage = Math.max(1, attackStrength);
        return damage;
    }

    private calculateExperienceGain(defender: Unit): number {
        return this.BASE_XP_GAIN * (defender.level - 1);
    }

    public applyExperience(unit: Unit, xp: number): { levelGained: boolean; newLevel?: number } {
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

    // Add this method to handle manual level ups
    public levelUpUnit(unit: Unit): void {
        // Only allow level up if unit has enough XP
        if (unit.experience < 100) return;

        // Increase level
        unit.level++;

        // Spend XP
        unit.experience -= 100;

        // Increase strength
        unit.attackStrength += 10;

        // Heal by 50, but don't exceed max health
        unit.currentHealth = Math.min(unit.maxHealth, unit.currentHealth + 50);

        // Spend all movement points
        unit.movementPoints = 0;
    }

    // Add this new helper method
    private canCounterAttack(attacker: Unit, defender: Unit): boolean {
        // Ranged attackers (range > 1) don't receive counter-attacks
        if (attacker.range > 1) {
            return false;
        }

        return defender.attackStrength > 0;
    }

    // Add this new method
    public fortifyUnit(unit: Unit): void {
        if (unit.movementPoints <= 0) {
            return;
        }
        unit.fortified = true;
        unit.movementPoints = 0;
    }
}
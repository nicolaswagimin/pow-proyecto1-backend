from abc import ABC, abstractmethod
import random

# =====================================================================
# CAPA 1: COMPONENTES Y RECURSOS (Composición)
# =====================================================================

class Estadisticas:
    """Clase 1: Maneja los atributos numéricos de un combatiente."""
    def __init__(self, hp_max: int, ataque: int, defensa: int, velocidad: int):
        self.hp_max = hp_max
        self.hp_actual = hp_max
        self.ataque = ataque
        self.defensa = defensa
        self.velocidad = velocidad

    def esta_vivo(self) -> bool:
        return self.hp_actual > 0

    def recibir_danio(self, cantidad: int) -> int:
        danio_neto = max(1, cantidad - self.defensa)
        self.hp_actual = max(0, self.hp_actual - danio_neto)
        return danio_neto

    def curar(self, cantidad: int):
        self.hp_actual = min(self.hp_max, self.hp_actual + cantidad)


class EfectoEstado(ABC):
    """Clase 2: Base abstracta para estados alterados periódicos."""
    def __init__(self, duracion: int):
        self.duracion = duracion

    @abstractmethod
    def aplicar(self, objetivo: 'Personaje'):
        pass


class Quemadura(EfectoEstado):
    """Clase 3: Estado que resta vida fija cada turno."""
    def __init__(self, duracion: int = 3, danio_quemadura: int = 15):
        super().__init__(duracion)
        self.danio_quemadura = danio_quemadura

    def aplicar(self, objetivo: 'Personaje'):
        if self.duracion > 0:
            objetivo.stats.hp_actual = max(0, objetivo.stats.hp_actual - self.danio_quemadura)
            self.duracion -= 1
            print(f"🔥 {objetivo.nombre} sufre {self.danio_quemadura} de daño por quemadura! (Resta: {self.duracion} turnos)")


# =====================================================================
# CAPA 2: SISTEMA DE EQUIPAMIENTO
# =====================================================================

class Arma:
    """Clase 4: Elemento equipable que escala el poder de ataque."""
    def __init__(self, nombre: str, bonus_ataque: int, prob_critico: float = 0.1):
        self.nombre = nombre
        self.bonus_ataque = bonus_ataque
        self.prob_critico = prob_critico

    def calcular_danio_extra(self) -> int:
        es_critico = random.random() < self.prob_critico
        danio = self.bonus_ataque * 2 if es_critico else self.bonus_ataque
        if es_critico:
            print("💥 ¡Golpe crítico con el arma!")
        return danio


# =====================================================================
# CAPA 3: JERARQUÍA DE PERSONAJES (Herencia y Polimorfismo)
# =====================================================================

class Personaje(ABC):
    """Clase 5: Base abstracta de todos los combatientes."""
    def __init__(self, nombre: str, stats: Estadisticas, arma: Arma):
        self.nombre = nombre
        self.stats = stats          # Composición
        self.arma = arma            # Composición
        self.estados: list[EfectoEstado] = []

    def procesar_turnos_estados(self):
        for estado in self.estados:
            estado.aplicar(self)
        self.estados = [e for e in self.estados if e.duracion > 0]

    @abstractmethod
    def ejecutar_turno(self, objetivo: 'Personaje'):
        """Método abstracto que cada arquetipo ejecuta diferente."""
        pass


class Guerrero(Personaje):
    """Clase 6: Especialista físico en daño acumulativo y resistencia."""
    def __init__(self, nombre: str, arma: Arma):
        super().__init__(nombre, Estadisticas(hp_max=220, ataque=35, defensa=18, velocidad=10), arma)
        self.furia = 0

    def ejecutar_turno(self, objetivo: 'Personaje'):
        self.furia += 10
        danio_base = self.stats.ataque + self.arma.calcular_danio_extra() + (self.furia // 2)
        danio_real = objetivo.stats.recibir_danio(danio_base)
        print(f"⚔️ {self.nombre} embiste con {self.arma.nombre} a {objetivo.nombre} causando {danio_real} de daño (Furia: {self.furia}).")


class Mago(Personaje):
    """Clase 7: Atacante a distancia dependiente de Maná y efectos."""
    def __init__(self, nombre: str, arma: Arma):
        super().__init__(nombre, Estadisticas(hp_max=130, ataque=15, defensa=8, velocidad=12), arma)
        self.mana = 100

    def ejecutar_turno(self, objetivo: 'Personaje'):
        if self.mana >= 30:
            self.mana -= 30
            danio_magico = 55 + self.arma.calcular_danio_extra()
            danio_real = objetivo.stats.recibir_danio(danio_magico)
            print(f"🔮 {self.nombre} lanza Piroexplosión a {objetivo.nombre} ({danio_real} daño)! Gasta 30 maná (Resta: {self.mana}).")
            objetivo.estados.append(Quemadura(duracion=2, danio_quemadura=12))
        else:
            self.mana += 20
            danio_golpe = objetivo.stats.recibir_danio(self.stats.ataque)
            print(f"🪄 {self.nombre} no tiene maná; golpea físicamente infligiendo {danio_golpe} daño y medita (+20 maná).")


class Picaro(Personaje):
    """Clase 8: Luchador ágil con probabilidad de evadir y ataques dobles."""
    def __init__(self, nombre: str, arma: Arma):
        super().__init__(nombre, Estadisticas(hp_max=160, ataque=28, defensa=10, velocidad=22), arma)

    def ejecutar_turno(self, objetivo: 'Personaje'):
        print(f"🗡️ {self.nombre} realiza un doble ataque rápido:")
        for i in range(2):
            danio = self.stats.ataque + self.arma.calcular_danio_extra()
            danio_real = objetivo.stats.recibir_danio(danio)
            print(f"   Hit {i + 1}: {danio_real} de daño a {objetivo.nombre}.")


# =====================================================================
# CAPA 4: INFRAESTRUCTURA Y GESTIÓN DEL ENTORNO
# =====================================================================

class BitacoraCombate:
    """Clase 9: Servicio para auditar y mostrar eventos de la batalla."""
    def __init__(self):
        self.registros = []

    def registrar(self, evento: str):
        self.registros.append(evento)
        print(evento)

    def resumen(self):
        print("\n" + "=" * 45)
        print("RESUMEN DE AUDITORÍA DE COMBATE")
        print("=" * 45)
        for linea in self.registros:
            print(linea)


class GestorTurnos:
    """Clase 10: Coordina el orden de iniciativa según la velocidad."""
    @staticmethod
    def ordenar_iniciativa(combatientes: list[Personaje]) -> list[Personaje]:
        # Mayor velocidad actúa primero
        return sorted(combatientes, key=lambda c: c.stats.velocidad, reverse=True)


class Arena:
    """Clase 11: Orquestador principal que controla el bucle del juego."""
    def __init__(self, equipo_a: list[Personaje], equipo_b: list[Personaje]):
        self.equipo_a = equipo_a
        self.equipo_b = equipo_b
        self.bitacora = BitacoraCombate()

    def _equipo_vivo(self, equipo: list[Personaje]) -> bool:
        return any(c.stats.esta_vivo() for c in equipo)

    def _obtener_objetivo_vivo(self, equipo: list[Personaje]) -> Personaje | None:
        vivos = [c for c in equipo if c.stats.esta_vivo()]
        return random.choice(vivos) if vivos else None

    def iniciar_combate(self):
        self.bitacora.registrar("⚔️ ¡COMIENZA EL ENFRENTAMIENTO EN LA ARENA! ⚔️")
        ronda = 1

        while self._equipo_vivo(self.equipo_a) and self._equipo_vivo(self.equipo_b):
            print(f"\n--- RONDA {ronda} ---")
            todos = self.equipo_a + self.equipo_b
            orden = GestorTurnos.ordenar_iniciativa(todos)

            for combatiente in orden:
                if not combatiente.stats.esta_vivo():
                    continue

                # Procesar efectos pasivos al inicio del turno
                combatiente.procesar_turnos_estados()
                if not combatiente.stats.esta_vivo():
                    self.bitacora.registrar(f"💀 {combatiente.nombre} ha caído por daño periódico.")
                    continue

                # Identificar bando enemigo
                rivales = self.equipo_b if combatiente in self.equipo_a else self.equipo_a
                objetivo = self._obtener_objetivo_vivo(rivales)

                if objetivo:
                    combatiente.ejecutar_turno(objetivo)
                    if not objetivo.stats.esta_vivo():
                        self.bitacora.registrar(f"💀 {objetivo.nombre} fue derrotado por {combatiente.nombre}!")

                if not self._equipo_vivo(self.equipo_a) or not self._equipo_vivo(self.equipo_b):
                    break

            ronda += 1

        ganador = "Equipo A" if self._equipo_vivo(self.equipo_a) else "Equipo B"
        self.bitacora.registrar(f"\n🏆 ¡Victoria definitiva para el {ganador}! 🏆")
        self.bitacora.resumen()


# =====================================================================
# EJECUCIÓN
# =====================================================================
if __name__ == "__main__":
    # Armas (Clase 4)
    hacha = Arma("Hacha de Guerra", bonus_ataque=12, prob_critico=0.15)
    baston = Arma("Báculo Arcano", bonus_ataque=8, prob_critico=0.30)
    dagas = Arma("Dagas Gemelas", bonus_ataque=6, prob_critico=0.25)

    # Combatientes (Clases 6, 7, 8 herederas de 5)
    heroe_1 = Guerrero("Thorin", hacha)
    heroe_2 = Mago("Gandalf", baston)
    enemigo_1 = Picaro("Loki", dagas)

    # Orquestación (Clases 9, 10, 11)
    arena = Arena(equipo_a=[heroe_1, heroe_2], equipo_b=[enemigo_1])
    arena.iniciar_combate()

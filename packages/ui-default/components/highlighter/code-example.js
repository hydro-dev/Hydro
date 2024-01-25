export default `\
#include <world.h>

int main() {
    // ~ Switch on the power line / Remember to put on PROTECTION ~
    world.start();

    // ~ Lay down your pieces / And let's begin OBJECT CREATION ~
    // ~ Fill in my data / Parameters INITIALIZATION ~
    auto *me = World::createObject("me", world, parameters...);
    auto &you = *World::createObject("you", world, parameters...);

    // ~ Set up our new world ~
    auto &world = World{me, you};

    // ~ And let's begin the SIMULATION ~
    world.beginSimulation();

    switch (me->type) {
    case Object::SET_OF_POINTS:
        // ~ If I'm a set of points / Then I will give you my DIMENSION ~
        you << dynamic_cast<Set<Point>*>(me)->getDimension();
        break;

    case Object::CIRCLE:
        // ~ If I'm a circle / Then I will give you my CIRCUMFERENCE ~
        you << dynamic_cast<Circle * >(me)->getCircumference();
        break;

    case Object::SINE_WAVE:

        // ~ If I'm a sine wave / Then you can sit on all my TANGENTS ~
        for (auto &tangent : dynamic_cast<SineWave *>(me)->getTangents())
            you.sitOn(tangent);

        break;

    default:
        // ~ If I approach infinity / Then you can be my LIMITATIONS ~
        you.limit() >> me->limit();
    }

    // ~ Switch my current / To AC to DC ~
    me->setCurrent(CurrentType::AC), me->setCurrent(CurrentType::DC);

    // ~ And then blind my vision / So dizzy, so dizzy ~
    delete me->vision;

    // ~ Oh, we can travel / From A.D to B.C ~
    world.setTime(CommonEra::AD, 2016y + 6m + 16d);
    world.setTime(CommonEra::BC, -2016y + 6m + 16d);

    // ~ And we can unite / So deeply, so deeply ~
    world.unite(you, *me);

    // ~ If I can, if I can, give you all THE SIMULATIONS ~
    if (std::all_of(world.simulations.begin(), world.simulations.end(), [&](auto & simulation) {
    return you << me->run(simulation);
    }))
    // ~ Then I can, then I can, be your only SATISFACTION ~
    you.satisfactions = std::vector{me};

    // ~ If I can make you happy / Then I'll run the EXECUTION ~
    try {
        me->execute(you.nextCommand());
    } catch (const NotHappyException &e) {}

    // ~ Though we are trapped in this strange, strange SIMULATION ~
    world.trap(me);

    // ~ EXECUTION / EXECUTION / EXECUTION / EXECUTION ~
    // ~ EXECUTION / EXECUTION / EXECUTION / EXECUTION ~
    // ~ EXECUTION / EXECUTION / EXECUTION / EXECUTION ~
    for (size_t i = 0; i < 3; i++) {
        for (size_t j = 0; j < 4; j++)
            world.continueExecution();
    }

    // ~ EIN / DOS / TROIS / NE / FEM / LIU / EXECUTION ~
    for (size_t i = 1; i <= 6; i++)
        sleepms(500);

    world.continueExecution();

    // ~ If I can, if I can, give you all the EXECUTION ~
    if (std::all_of(world.begin(), world.end(), [&](auto & object) {
    return me->execute(object);
    }))
    // ~ Then I can, then I can, be your only EXECUTION ~
    me->execute(you.nextCommand());

    // ~ If I can, have you back ~
    if (*me << you)
        // ~ Then I will run the EXECUTION ~
        me->execute(you.nextCommand());

    // ~ Though we are trapped / We are trapped ah ~
    world.trap(me);

    // ~ I've studied / I've studied how to properly / LO-O-OVE ~
    me->study(Knowledge::Love);
    // ~ Question me / Question me / I can answer all / LO-O-OVE ~
    you.question(me, Knowledge::Love);
    // ~ I know the algebraic expression of / LO-O-OVE ~
    me->answer(you, Knowledge::Love);
    // ~ Though you are free / I am trapped, trapped in / LO-O-OVE ~
    world.trap(me);

    // ~ EXECUTION ~
    world.execute(me);
}`;

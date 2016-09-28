import IterableSchema from 'normalizr/lib/IterableSchema';
import EntitySchema from 'normalizr/lib/EntitySchema';
import UnionSchema from 'normalizr/lib/UnionSchema';
import assign from 'lodash/assign';
import merge from 'lodash/merge';
import isObject from 'lodash/isObject';
import { isImmutable, getIn, setIn } from './ImmutableUtils'

/**
 * Take either an entity or id and derive the other.
 * Always take entity from entities as it might be cached.
 *
 * @param   {object|Immutable.Map|number|string} entityOrId
 * @param   {object|Immutable.Map} entities
 * @param   {Schema} schema
 * @returns {object}
 */
function resolveEntityOrId(entityOrId, entities, schema) {
  const key = schema.getKey();

  let entity = entityOrId
  let id = entityOrId

  if (isObject(entityOrId)) {
    id = getIn(entity, [schema.getIdAttribute()])
    entity = getIn(entities, [key, id])
  } else {
    entity = getIn(entities, [key, id])
  }

  return { entity, id }
}


/**
 * Denormalizes each entity in the given array.
 *
 * @param   {Array|Immutable.List} items
 * @param   {object|Immutable.Map} entities
 * @param   {Schema} schema
 * @param   {object} bag
 * @returns {Array|Immutable.List}
 */
function denormalizeIterable(items, entities, schema, bag) {
  const itemSchema = schema.getItemSchema();

  return items.map(o => denormalize(o, entities, itemSchema, bag));
}
/*
 * Same as denormalizeIterable() but returns `items` if nothing changed
 */
function denormalizeIterableMemoized(items, entities, schema, bag) {
  const itemSchema = schema.getItemSchema();
  
  let isDifferent = false
  const newItems = items.map((o, i) => {
    let newItem = denormalizeMemoized(o, entities, itemSchema, bag)

    if (newItem !== items[i]) {
      isDifferent = true
    }

    return newItem
  });

  return isDifferent ? newItems : items
}

/**
 * @param   {object|Immutable.Map|number|string} entity
 * @param   {object|Immutable.Map} entities
 * @param   {Schema} schema
 * @param   {object} bag
 * @returns {object|Immutable.Map}
 */
function denormalizeUnion(entity, entities, unionSchema, bag) {
  if (!entity.schema)
    throw new Error('Expect `entity` to have a schema key as a result from normalizing an union.')

  const itemSchema = unionSchema.getItemSchema()[entity.schema]

  const id = getIn(entity, [itemSchema.getIdAttribute()])
  const trueEntity = getIn(entities, [itemSchema.getKey(), id])

  return denormalize(
    trueEntity,
    entities,
    itemSchema,
    bag
  );
}
/*
 * Same as denormalizeUnion for now
 */
function denormalizeUnionMemoized(entity, entities, unionSchema, bag) {
  if (!entity.schema)
    throw new Error('Expect `entity` to have a schema key as a result from normalizing an union.')

  const itemSchema = unionSchema.getItemSchema()[entity.schema]

  const id = getIn(entity, [itemSchema.getIdAttribute()])
  const trueEntity = getIn(entities, [itemSchema.getKey(), id])

  return denormalizeMemoized(
    trueEntity,
    entities,
    itemSchema,
    bag
  );
}

/**
 * Takes an object and denormalizes it.
 *
 * Note: For non-immutable objects, this will mutate the object. This is
 * necessary for handling circular dependencies. In order to not mutate the
 * original object, the caller should copy the object before passing it here.
 *
 * @param   {object|Immutable.Map} obj
 * @param   {object|Immutable.Map} entities
 * @param   {Schema} schema
 * @param   {object} bag
 * @returns {object|Immutable.Map}
 */
function denormalizeObject(obj, entities, schema, bag) {
  let denormalized = obj

  Object.keys(schema)
    .filter(attribute => attribute.substring(0, 1) !== '_')
    .filter(attribute => typeof getIn(obj, [attribute]) !== 'undefined')
    .forEach(attribute => {

      const item = getIn(obj, [attribute]);
      const itemSchema = getIn(schema, [attribute]);

      denormalized = setIn(denormalized, [attribute], denormalize(item, entities, itemSchema, bag));
    });

  return denormalized;
}

/**
 * Takes an entity, saves a reference to it in the 'bag' and then denormalizes
 * it. Saving the reference is necessary for circular dependencies.
 *
 * @param   {object|Immutable.Map|number|string} entityOrId
 * @param   {object|Immutable.Map} entities
 * @param   {Schema} schema
 * @param   {object} bag
 * @returns {object|Immutable.Map}
 */
function denormalizeEntity(entityOrId, entities, schema, bag) {
  const key = schema.getKey();
  const { entity, id } = resolveEntityOrId(entityOrId, entities, schema)

  if(!bag.hasOwnProperty(key)) {
    bag[key] = {};
  }

  if(!bag[key].hasOwnProperty(id)) {
    // Ensure we don't mutate it non-immutable objects
    const obj = isImmutable(entity) ? entity : merge({}, entity)

    // Need to set this first so that if it is referenced within the call to
    // denormalizeObject, it will already exist.
    bag[key][id] = obj;
    bag[key][id] = denormalizeObject(obj, entities, schema, bag);
  }

  return bag[key][id];
}

/**
 * Same as denormalizeEntity right above, but memoized
 * /!\ Does not handle circular dependencies
 */
// TODO: Pass cache as parameter to enable differents caches for different entity sets with entity names that may collide (e.g. 2 entity sets each with a "Post" entity)
export let cache = {}

function denormalizeEntityMemoized(entityOrId, entities, schema, bag) {
  const key = schema.getKey();
  const { entity, id } = resolveEntityOrId(entityOrId, entities, schema)

  if (!entity)
    return null
  
  /* Cache */
  if (!cache[key])
    cache[key] = {}
  if (!cache[key][id]) {
    cache[key][id] = {
      entity,
      denormalized: entity,
    }
  }
  /* Cache *****/

  if(!bag.hasOwnProperty(`${key}:${id}`)) {
    bag[`${key}:${id}`] = true

    /* If cache entity is different, wipe cache */
    if (cache[key][id].entity !== entity) {
      cache[key][id].entity = entity
      cache[key][id].denormalized = entity
    }

    /* Start with the cache as reference */
    let referenceObject = cache[key][id].denormalized
    let relationsToUpdate = {}

    /* For each relation in EntitySchema */
    Object.keys(schema)
      /* Filter out private attributes */
      .filter(attribute => attribute.substring(0, 1) !== '_')
      /* Filter out relations not present */
      .filter(attribute => typeof getIn(referenceObject, [attribute]) !== 'undefined')
      .forEach(relation => {
        const item = getIn(referenceObject, [relation]);
        const itemSchema = getIn(schema, [relation]);

        const denormalizedItem = denormalizeMemoized(item, entities, itemSchema, bag)
        
        if (denormalizedItem !== item) {
          relationsToUpdate[relation] = denormalizedItem;
        }

      });

    /* If there is any relations to update, we send a new object */
    let returnObject = referenceObject
    if (Object.keys(relationsToUpdate).length > 0) {
      returnObject = assign({}, returnObject, relationsToUpdate)
    }

    /* We update the cache */
    cache[key][id].denormalized = returnObject

    delete bag[`${key}:${id}`]

    return returnObject
  } else {
    return id
  }
}

/**
 * Takes an object, array, or id and returns a denormalized copy of it. For
 * an object or array, the same data type is returned. For an id, an object
 * will be returned.
 *
 * If the passed object is null or undefined or if no schema is provided, the
 * passed object will be returned.
 *
 * @param   {object|Immutable.Map|array|Immutable.list|number|string} obj
 * @param   {object|Immutable.Map} entities
 * @param   {Schema} schema
 * @param   {object} bag
 * @returns {object|Immutable.Map|array|Immutable.list}
 */
function denormalize(obj, entities, schema, bag = {}) {
  if (obj === null || typeof obj === 'undefined' || !isObject(schema)) {
    return obj;
  }

  if (schema instanceof EntitySchema) {
    return denormalizeEntity(obj, entities, schema, bag);
  } else if (schema instanceof IterableSchema) {
    return denormalizeIterable(obj, entities, schema, bag);
  } else if (schema instanceof UnionSchema) {
    return denormalizeUnion(obj, entities, schema, bag);
  } else {
    // Ensure we don't mutate it non-immutable objects
    const entity = isImmutable(obj) ? obj : merge({}, obj)
    return denormalizeObject(entity, entities, schema, bag);
  }
}

/**
 * Same as denormalize right above, but memoized
 */
function denormalizeMemoized(obj, entities, schema, bag = {}) {
  if (obj === null || typeof obj === 'undefined' || !isObject(schema)) {
    return obj;
  }

  if (schema instanceof EntitySchema) {
    return denormalizeEntityMemoized(obj, entities, schema, bag);
  } else if (schema instanceof IterableSchema) {
    return denormalizeIterableMemoized(obj, entities, schema, bag);
  } else if (schema instanceof UnionSchema) {
    return denormalizeUnionMemoized(obj, entities, schema, bag);
  }
}

/**
 * Exposed function
 */
// eslint-disable-next-line no-undef
module.exports.denormalize = function (obj, entities, schema, options = {}) {
  if (options.memoized) {
    return denormalizeMemoized(obj, entities, schema, {});
  } else {
    return denormalize(obj, entities, schema, {});
  }
}
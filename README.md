<p align="center">
    <img style="margin: 0 auto" src="https://cloud.githubusercontent.com/assets/120693/19218826/36eb41c2-8e04-11e6-98a5-2fdad6ca45fe.png" width="359">
</p>

**denormalizr** takes data and entities normalized by [normalizr](https://github.com/gaearon/normalizr), and returns its complete tree – including nested entities.

This module is useful when consuming normalized data, e.g. in redux [selectors](http://redux.js.org/docs/recipes/ComputingDerivedData.html). While normalizr is great on making data consistent between the app, reassembling entities can be a tedious work. Denormalizr can help!


[![npm version](https://img.shields.io/npm/v/denormalizr.svg?style=flat-square)](https://www.npmjs.com/package/denormalizr)
[![npm downloads](https://img.shields.io/npm/dm/denormalizr.svg?style=flat-square)](https://www.npmjs.com/package/denormalizr)
[![build status](https://img.shields.io/travis/gpbl/denormalizr/master.svg?style=flat-square)](https://travis-ci.org/gpbl/denormalizr) 
[![Code Climate](https://img.shields.io/codeclimate/github/gpbl/denormalizr.svg?style=flat-square)](https://codeclimate.com/github/gpbl/denormalizr) 
[![Coveralls](https://img.shields.io/coveralls/gpbl/denormalizr.svg?style=flat-square)](https://coveralls.io/github/gpbl/denormalizr)

```
npm install denormalizr --save
```

```js
import { denormalize } from "denormalizr";
const denormalized = denormalize(entity, entities, entitySchema, { memoized: false });
```

### Documentation 

* [API](#api)
* [Examples](#examples)
  * [Denormalize a single object](#denormalize-a-single-object)
  * [Denormalize a list of objects](#denormalize-a-list-of-objects)
  * [Denormalize by passing the id](#denormalize-by-passing-the-id)
  * [Denormalize by passing a list of ids](#denormalize-by-passing-a-list-of-ids)
  * [Recursive schemas](#recursive-schemas)
* [Usage with Immutable](#usage-with-immutable)
* [Changelog](CHANGELOG.md)

## API

```
denormalize (entity, entities, schema, options: { memoized: bool}) -> Object|Array|Immutable.Map|Immutable.List
```

### Params 

**entity** `{Object|Array|Number|String|Immutable.Map|Immutable.List}` 

> The entity to denormalize, its id, or an array of entities or ids.

**entities** `{Object|Immutable.Map}` 

> An object to entities used to denormalize entity and its referred entities.

**entitySchema** `{Schema}`

> The normalizr Schema used to define `entity`.

**options** `{Object}`
> * **memoized** `{Boolean}`
Whether `denormalize` should return previous result if nothing changed in the concerned entity. Defaults to `false`. 

### Returns

The denormalized object (or Immutable.Map), or an array of denormalized objects (or an Immutable.List).

## Examples

For the following examples, consider to have a JSON response from a REST API consisting in a list of articles,
where each article has a `author` field.

```json
{
  "articles": [{
    "id": 1,
    "title": "10 mindblowing reasons to prefer composition over inheritance",
    "author": {
      "id": 1,
      "name": "Dan"
    },
  }, {
    "id": 2,
    "title": "You won't believe what this high order component is doing",
    "author": {
      "id": 1,
      "name": "Dan"
    }
  }]
}
```

To normalize this response with normalizr, we can define two Schemas: `articleSchema` and `authorSchema`.

```js
import { normalize, arrayOf, Schema } from 'normalizr';

const articleSchema = new Schema('articles');
const authorSchema = new Schema('authors');
const articleList = arrayOf(articleSchema);

articleSchema.define({
  author: authorSchema,
});

const normalized = normalize(response, {
  articles: articleList,
})
```

This way we have the usual normalized object with entities:

```js
// content of normalized
{ entities: 
   { articles: 
      { '1': 
         { id: 1,
           title: '10 mindblowing reasons to prefer composition over inheritance',
           author: 1 },
        '2': 
         { id: 2,
           title: 'You won\'t believe what this high order component is doing',
           author: 1 } },
     authors: 
      { '1': 
         { id: 1, 
          name: 'Dan' } } },
  result: { articles: [ 1, 2 ] } }
```

Let say we want to display the articles with ids `1` and `2`, and for each article its author. 

In order to get the whole author object for each article, we need to loop over the author entities: 

```js
const articleIds = [1, 2];
const articles = articleIds.map(id => {
  const article = normalized.entities.articles[id];
  article.author = normalized.entities.authors[article.author];
});
```

We are basically reverting to the original JSON response. We are, indeed, *denormalizing*. 

Without the need to know the entity's shapes, we can use denormalizr to simplify this process. Thus:

```js
import { denormalize } from 'denormalizr';

const entitiesId = [1, 2];

const articles = denormalize(entitiesId, normalized.entities, articleList, { memoized: true | false });
```

`articles` contains now the selected articles with the authors in them:

```js
// console.log(articles)
[ { id: 1,
    title: '10 mindblowing reasons to prefer composition over inheritance',
    author: { id: 1, name: 'Dan' } },
  { id: 2,
    title: 'You won\'t believe what this high order component is doing',
    author: { id: 1, name: 'Dan' } } ]
```

If you set the `memoized` option to `true`, the `articles` array will also be the same as long as underlying entities or relations didn't change :

```js
const articles1 = denormalize(entitiesId, normalized.entities, articleList, { memoized: true });

const articles2 = denormalize(entitiesId, normalized.entities, articleList, { memoized: true });

console.log(articles1 === articles2); // true

// We change related author entity
// Note: Shallow comparison is used for memoization, so be sure to always return a new object. Treat entities as immutable data.
normalized.entities.authors['1'] = {
  id: '1',
  name: 'John',
};

const articles3 = denormalize(entitiesId, normalized.entities, articleList, { memoized: true });

console.log(articles2 === articles3); // false
```

`denormalize()` accepts as first parameter the **entity** we want to denormalize, which can be a 
single object, an array of object, a single id or an array of ids.
The second parameter is the whole **entities** object, which is consumed when the **entity schema** (third
parameter) has references to one or more entities.

> Be careful: when using `denormalize()` with `memoized` set to `true`, be sure to always supply the same object or array as input. It is easy to make the mistake for an array of id :
> ```js
> // WRONG x
> const articles1 = denormalize([1, 2], normalized.entities, articleList, { memoized: true });
> const articles2 = denormalize([1, 2], normalized.entities, articleList, { memoized: true });
> 
> console.log(articles1 === articles2); // false, because supplied arrays are different
>
> // RIGHT ✓
> const entitiesId = [1, 2];
> 
> const articles1 = denormalize(entitiesId, normalized.entities, articleList, { memoized: true });
> const articles2 = denormalize(entitiesId, normalized.entities, articleList, { memoized: true });
>
> console.log(articles1 === articles2); // true
> ```

### Denormalize a single object

```js
const article = normalized.entities.articles['1'];
const denormalized = denormalize(article, normalized.entities, articleSchema, { memoized: false | true });
```
```js
// console.log(denormalized)
{
  id: 1,
  title: 'Some Article',
  author: {
    id: 1,
    name: 'Dan'
  },
}
```
### Denormalize a list of objects

```js
const article1 = normalized.entities.articles['1'];
const article2 = normalized.entities.articles['2'];

const articles = [article1, article2];

const denormalized = denormalize(articles, normalized.entities, articleListSchema, { memoized: false | true });
```

```js
// console.log(denormalized)
[{
  id: 1,
  title: '10 mindblowing reasons to prefer composition over inheritance',
  author: {
    id: 1,
    name: 'Dan'
  },
},{
  id: 2,
  title: 'You won\'t believe what this high order component is doing',
  author: {
    id: 1,
    name: 'Dan'
  },
}]
```

### Denormalize by passing the id

```js
const denormalized = denormalize(1, normalized.entities, articleSchema);
```

```js
// console.log(denormalized);
{
  id: 1,
  title: '10 mindblowing reasons to prefer composition over inheritance',
  author: {
    id: 1,
    name: 'Dan'
  },
}
```

### Denormalize by passing a list of ids

```js
const entitiesId = [1, 2];
const denormalized = denormalize(entitiesId, normalized.entities, articleListSchema, { memoized: false | true });
```

```js
// console.log(denormalized)
[{
  id: 1,
  title: '10 mindblowing reasons to prefer composition over inheritance',
  author: {
    id: 1,
    name: 'Dan'
  },
},{
  id: 2,
  title: 'You won\'t believe what this high order component is doing',
  author: {
    id: 1,
    name: 'Dan'
  },
}]
```

### Recursive schemas
> Note: `memoized` option **does not** handle circular schema.

Denormalizr can handle circular references caused by recursive schemas (see [#2](https://github.com/gpbl/denormalizr/pull/2)). 

For example, take these schemas, where articles have an author property containing a list of articles: 

```js
const articleSchema = new Schema('articles');
const authorSchema = new Schema('author');
const articleList = arrayOf(articleSchema);

articleSchema.define({
  author: authorSchema,
});

authorSchema.define({
  articles: articleList,
});

const JSONResponse = {
  "articles": [{
    "id": 2,
    "title": "You won\'t believe what this high order component is doing",
    "author": {
      "id": 1,
      "name": 'Dan',
      "articles": [2],
    },
  }],
};

const normalized = normalize(JSONResponse, {
  articles: articleList,
});

const article = data.entities.articles['2'];
const denormalized = denormalize(article, data.entities, articleSchema);

console.log(denormalized.author.articles[0] === denormalized)); // true

```

## Usage with Immutable

Denormalizr works well with [immutable-js](https://facebook.github.io/immutable-js/), however recursive schemas are [not supported](https://github.com/facebook/immutable-js/issues/259):

```js
// This nested article contains only a reference to the author's id:
denormalized.author.articles[0].author === 1
```

Related work:

* [denormalizr-immutable](https://github.com/dehbmarques/denormalizr-immutable).

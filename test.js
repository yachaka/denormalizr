
const denormalize = require('./src').denormalize
const normalizr = require('normalizr')
const pretty = require('prettyjson').render

const Book = new normalizr.Schema('books')
const Author = new normalizr.Schema('authors')

Book.define({
  author: Author
})

Author.define({
  books: normalizr.arrayOf(Book)
})

const response = {
  id: 1,
  title: 'Game of Thrones',
  author: {
    id: 1,
    name: 'Georges RR Martin',
    // books: [1],
  }
}
//   },
//   {
//     id: 2,
//     title: 'LotR 1',
//     author: {
//       id: 2,
//       name: 'Tolkien',
//     },
//   },
//   {
//     id: 3,
//     title: 'LotR 2',
//     author: {
//       id: 2,
//       name: 'Tolkien'
//     },
//   }
// ]

let normalized = normalizr.normalize(response, Book)
// console.log(pretty(normalized.entities))
// let books = Object.keys(normalized.entities.books).map(k => normalized.entities.books[k])
let denormalized1 = denormalize(normalized.result, normalized.entities, Book)
let denormalized2 = denormalize(normalized.result, normalized.entities, Book)

console.log(denormalized1 === denormalized2)
console.log(denormalized1, denormalized2)